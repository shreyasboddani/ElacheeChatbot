import { z } from "zod";

import { MAX_ASSISTANT_ANSWER_LENGTH } from "@/lib/chat/limits";
import {
  contactFallback,
  sourceVerificationFallback,
  visitorCenterHoursConflictFallback,
} from "@/lib/contact-fallback";
import { resolveFileCitations } from "@/lib/gemini/citations";
import type { FileCitationAnnotation } from "@/lib/gemini/citations";
import {
  buildInteractionInput,
  buildSystemInstruction,
} from "@/lib/gemini/prompts";
import { containsNonElacheePhoneNumber } from "@/lib/security/phone-numbers";
import type {
  ChatResponse,
  SourceManifestEntry,
} from "@/lib/knowledge/types";
import type { ChatRequest } from "@/lib/security/input-validation";
import type { ChatLanguagePreference } from "@/lib/chat/language";
import { focusConversationalQuery } from "@/lib/chat/local-response";

const modelPayloadSchema = z.object({
  status: z.enum(["answered", "not_found", "conflicting_information"]),
  answer: z.string().trim().min(1).max(MAX_ASSISTANT_ANSWER_LENGTH),
});

const SIMPLE_RESPONSE_TOKEN_LIMIT = 224;
const COMPLEX_RESPONSE_TOKEN_LIMIT = 384;
const SIMPLE_RETRIEVAL_RESULT_LIMIT = 6;
const FOLLOW_UP_RETRIEVAL_RESULT_LIMIT = 8;
const COMPLEX_RETRIEVAL_RESULT_LIMIT = 10;
function isComplexRequest(request: ChatRequest): boolean {
  const wordCount = request.message.trim().split(/\s+/).filter(Boolean).length;
  return (
    request.message.length > 140 ||
    wordCount > 22 ||
    request.message.includes("\n") ||
    (request.message.match(/\?/g)?.length ?? 0) > 1
  );
}

function isBroadPlanningRequest(request: ChatRequest): boolean {
  return /\b(what should i know|before (?:i )?visit(?:ing)?|plan (?:a|my|our) visit|first visit|visiting elachee)\b/i.test(
    request.message,
  );
}

export function responseTokenLimit(request: ChatRequest): number {
  return isComplexRequest(request) || isBroadPlanningRequest(request)
    ? COMPLEX_RESPONSE_TOKEN_LIMIT
    : SIMPLE_RESPONSE_TOKEN_LIMIT;
}

export function retrievalResultLimit(request: ChatRequest): number {
  if (isComplexRequest(request) || isBroadPlanningRequest(request)) {
    return COMPLEX_RETRIEVAL_RESULT_LIMIT;
  }
  return request.history.length > 0
    ? FOLLOW_UP_RETRIEVAL_RESULT_LIMIT
    : SIMPLE_RETRIEVAL_RESULT_LIMIT;
}

interface TextBlock {
  type: "text";
  text: string;
  annotations?: FileCitationAnnotation[];
}

interface InteractionStep {
  type: string;
  content?: TextBlock[];
}

export interface GroundedInteraction {
  status?: string;
  steps: InteractionStep[];
}

export interface GroundedInteractionClient {
  create(params: {
    model: string;
    input: ReturnType<typeof buildInteractionInput>;
    system_instruction: string;
    store: false;
    tools: Array<{
      type: "file_search";
      file_search_store_names: string[];
      top_k: number;
    }>;
    generation_config: {
      max_output_tokens: number;
      thinking_level: "minimal";
    };
    response_format: {
      type: "text";
      mime_type: "application/json";
      schema: Record<string, unknown>;
    };
  }): Promise<GroundedInteraction>;
}

export function buildGroundedInteractionParams(
  request: ChatRequest,
  model: string,
  fileSearchStore: string,
  currentDate?: string,
) {
  return {
    model,
    input: buildInteractionInput(request),
    system_instruction: buildSystemInstruction(currentDate, request.language),
    store: false as const,
    generation_config: {
      max_output_tokens: responseTokenLimit(request),
      thinking_level: "minimal" as const,
    },
    tools: [
      {
        type: "file_search" as const,
        file_search_store_names: [fileSearchStore],
        top_k: retrievalResultLimit(request),
      },
    ],
    response_format: {
      type: "text" as const,
      mime_type: "application/json" as const,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["answered", "not_found", "conflicting_information"],
          },
          answer: {
            type: "string",
            minLength: 1,
            maxLength: MAX_ASSISTANT_ANSWER_LENGTH,
          },
        },
        required: ["status", "answer"],
      },
    },
  };
}

export function interpretGroundedInteraction(
  interaction: GroundedInteraction,
  manifest: SourceManifestEntry[],
  language: ChatLanguagePreference = "auto",
  request?: ChatRequest,
): ChatResponse {
  const textBlocks = interaction.steps.flatMap((step) =>
    step.type === "model_output" ? (step.content ?? []) : [],
  );
  const text = textBlocks.map((block) => block.text).join("").trim();
  const annotations = textBlocks.flatMap((block) => block.annotations ?? []);
  const sources = resolveFileCitations(annotations, manifest);

  let parsed: z.infer<typeof modelPayloadSchema>;
  try {
    parsed = modelPayloadSchema.parse(JSON.parse(text));
  } catch {
    return sourceVerificationFallback(undefined, language);
  }

  if (parsed.status === "conflicting_information") {
    return contactFallback(
      "conflicting_information",
      sources,
      language,
    );
  }
  if (parsed.status === "not_found") {
    return contactFallback("not_found", undefined, language);
  }
  const visitorCenterHoursConflict = manifest.some((entry) =>
    entry.conflictingTopics?.includes("visitor_center_hours"),
  );
  const visitorCenterScheduleAnswer =
    /\b(?:visitor cent(?:er|re)|exhibits?)\b/i.test(parsed.answer) &&
    /\b(?:hours?|open(?:ed)?|closed|schedule|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.test(
      parsed.answer,
    );
  const asksAboutSchedule =
    request !== undefined &&
    /\b(?:hours?|open|closed|when)\b/i.test(request.message);
  const asksOnlyAboutTrailSchedule =
    request !== undefined &&
    /\b(?:hiking )?trails?\b/i.test(request.message) &&
    !/\b(?:visitor cent(?:er|re)|exhibits?)\b/i.test(request.message);
  if (
    visitorCenterHoursConflict &&
    (visitorCenterScheduleAnswer ||
      (asksAboutSchedule && !asksOnlyAboutTrailSchedule))
  ) {
    return visitorCenterHoursConflictFallback(sources, language);
  }
  if (sources.length === 0) {
    return sourceVerificationFallback(undefined, language);
  }
  if (containsNonElacheePhoneNumber(parsed.answer)) {
    return sourceVerificationFallback(sources, language);
  }

  return {
    status: "answered",
    answer: parsed.answer,
    sources,
    contactRecommended: false,
  };
}

export async function askGroundedQuestion(
  client: GroundedInteractionClient,
  request: ChatRequest,
  options: {
    model: string;
    fileSearchStore: string;
    manifest: SourceManifestEntry[];
  },
): Promise<ChatResponse> {
  const groundedRequest: ChatRequest = {
    ...request,
    message: focusConversationalQuery(request.message, request.history),
  };
  const params = buildGroundedInteractionParams(
    groundedRequest,
    options.model,
    options.fileSearchStore,
  );
  const interaction = await client.create(params);
  const response = interpretGroundedInteraction(
    interaction,
    options.manifest,
    request.language,
    request,
  );
  if (request.history.length === 0 || response.status !== "not_found") {
    return response;
  }

  // A contextual turn can occasionally be answered from the conversation
  // without a fresh File Search citation. Retry the already-expanded question
  // once without history so a current approved source must support the answer.
  try {
    const retryRequest: ChatRequest = { ...groundedRequest, history: [] };
    const retryInteraction = await client.create(
      buildGroundedInteractionParams(
        retryRequest,
        options.model,
        options.fileSearchStore,
      ),
    );
    const retryResponse = interpretGroundedInteraction(
      retryInteraction,
      options.manifest,
      request.language,
      request,
    );
    return retryResponse.status === "not_found" ? response : retryResponse;
  } catch {
    return response;
  }
}
