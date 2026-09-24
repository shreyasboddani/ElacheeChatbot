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
  ChatSource,
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
const TOPIC_MATCH_STOP_WORDS = new Set([
  "about", "after", "again", "also", "been", "being", "could", "does",
  "every", "from", "have", "here", "into", "just", "know", "more", "only",
  "other", "some", "than", "that", "their", "them", "there", "these",
  "they", "this", "those", "through", "under", "very", "were", "what",
  "when", "where", "which", "while", "with", "would", "your",
]);

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
}

function includesTopicTerm(message: string, terms: readonly string[]): boolean {
  const messageWords = normalizeForMatching(message).match(/[a-z0-9]+/g) ?? [];
  return messageWords.some((word) => {
    if (TOPIC_MATCH_STOP_WORDS.has(word)) return false;
    const collapsed = word.replace(/(.)\1+/g, "$1");
    return terms.some((term) => {
      if (word === term || collapsed === term) return true;
      if (Math.min(collapsed.length, term.length) < 4) return false;
      const tolerance = Math.max(collapsed.length, term.length) >= 7 ? 2 : 1;
      return (
        Math.abs(collapsed.length - term.length) <= tolerance &&
        editDistance(collapsed, term) <= tolerance
      );
    });
  });
}

function includesExactTopicTerm(message: string, terms: readonly string[]): boolean {
  const messageWords = normalizeForMatching(message).match(/[a-z0-9]+/g) ?? [];
  return messageWords.some((word) => terms.includes(word));
}

type FeaturedQuestion = "visit" | "trails" | "programs" | "fieldTrips" | "events" | "hours";

export function featuredQuestion(message: string): FeaturedQuestion | undefined {
  const normalized = normalizeForMatching(message);
  if (/\b(?:plan (?:a|my|our) visit|help me plan|what should i know before (?:i )?visiting|before (?:i )?visiting|first visit|visiting elachee|plan(?:ear|ifica(?:r)?) (?:mi|una|la) visita)\b/.test(normalized) ||
    (includesTopicTerm(normalized, ["before", "prior"]) &&
      includesTopicTerm(normalized, ["visit", "visiting", "visits"]))) {
    return "visit";
  }
  if (includesTopicTerm(normalized, [
    "fieldtrip", "fieldtrips", "trip", "trips", "excursion", "excursiones",
  ])) {
    return "fieldTrips";
  }
  if (includesTopicTerm(normalized, [
    "camp", "camps", "program", "programs", "campamento", "campamentos",
  ])) {
    return "programs";
  }
  if (includesTopicTerm(normalized, [
    "event", "events", "upcoming", "proximo", "proximos", "calendario",
  ])) {
    return "events";
  }
  if (
    includesExactTopicTerm(normalized, [
      "open", "opening", "closed", "when", "horario", "horarios",
      "cuando", "abren", "abierto", "cerrado", "entrada",
    ]) ||
    includesTopicTerm(normalized, [
      "hour", "hours", "admission", "parking", "estacionamiento",
    ])
  ) {
    return "hours";
  }
  if (includesTopicTerm(normalized, [
    "hiking", "trail", "trails", "chicopee", "sendero", "senderos",
  ])) {
    return "trails";
  }
  return undefined;
}

const FEATURED_RETRY_QUERIES: Record<FeaturedQuestion, string> = {
  visit: "Plan a visit to Elachee Nature Science Center: Visitor Center and Chicopee Woods trail hours, admission and parking costs, address, and practical visitor tips.",
  trails: "Chicopee Woods hiking trails: names, distances, difficulty, accessibility, dogs, trail hours, and important safety or planning notes.",
  programs: "Elachee camps and programs: age eligibility, schedule or season, program format, and where to find current registration and availability.",
  fieldTrips: "Elachee field trips: grade levels, educational topics, onsite and outreach formats, and how teachers request a trip.",
  events: "Elachee events with explicitly confirmed dates on or after today's date; include event name, date, time, and location only when retrieved from current official sources.",
  hours: "Elachee Visitor Center and exhibits hours compared with Chicopee Woods Nature Preserve trail hours; distinguish both schedules and include separate visitor admission and park parking fees.",
};

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
  return featuredQuestion(request.message) !== undefined;
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

  const hasAuthoritativeHoursSource = sources.some((source) => {
    if (
      source.sourceType !== "official_reference" &&
      source.sourceType !== "official_website"
    ) {
      return false;
    }
    if (source.id === "visitor-hours") return true;
    try {
      return ["/hours", "/resources/hours"].includes(
        new URL(source.url ?? "").pathname.replace(/\/$/, ""),
      );
    } catch {
      return false;
    }
  });
  const isHoursQuestion = request !== undefined &&
    /\b(?:hours?|open|closed|when|horarios?|abiert[oa]s?|cerrad[oa]s?|cuando)\b/i.test(
      normalizeForMatching(request.message),
    );
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
  const visitorCenterHoursConflict = sources.some((source) =>
    manifest.find((entry) => entry.id === source.id)?.conflictingTopics?.includes(
      "visitor_center_hours",
    ),
  ) && !hasAuthoritativeHoursSource;
  const visitorCenterScheduleAnswer =
    /\b(?:visitor cent(?:er|re)|exhibits?|centro de visitantes|exhibiciones)\b/i.test(normalizeForMatching(parsed.answer)) &&
    /\b(?:hours?|open(?:ed)?|closed|schedule|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.test(
      normalizeForMatching(parsed.answer),
    );
  const asksAboutSchedule =
    request !== undefined &&
    isHoursQuestion;
  const asksOnlyAboutTrailSchedule =
    request !== undefined &&
    /\b(?:hiking )?trails?|senderos?\b/i.test(normalizeForMatching(request.message)) &&
    !/\b(?:visitor cent(?:er|re)|exhibits?|centro de visitantes|exhibiciones)\b/i.test(normalizeForMatching(request.message));
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

function hasOfficialPage(
  response: ChatResponse,
  pathPattern: RegExp,
): boolean {
  return response.sources.some((source) => {
    if (
      source.sourceType !== "official_website" &&
      source.sourceType !== "official_reference" &&
      source.sourceType !== "official_document"
    ) {
      return false;
    }
    try {
      return pathPattern.test(new URL(source.url ?? "").pathname.toLowerCase());
    } catch {
      return false;
    }
  });
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function expectsSpanishResponse(request: ChatRequest): boolean {
  return (
    request.language === "es" ||
    (request.language === "auto" &&
      (/[\u00bf\u00a1]/.test(request.message) ||
        /\b(?:senderos|horarios|admision|eventos|excursiones|campamentos|planificar|visita)\b/.test(
          normalizeForMatching(request.message),
        )))
  );
}

function answerIsPredominantlySpanish(answer: string): boolean {
  const normalized = normalizeForMatching(answer);
  const spanishMarkers =
    normalized.match(/\b(?:de|y|que|se|los|las|del|para|con|por|una|uno|pero|son|estan|abren|diario|tienen|hay|este|esta|estos|estas|puede|acceso|gratis|desde|hasta|tambien|segun|deben|debe|consulta|lleva|lleven|puedes|pueden|incluye|cuesta|senderos?|millas?|mide|miden|abierto|abierta|cerrado|cerrada)\b/g) ?? [];
  const englishMarkers =
    normalized.match(/\b(?:the|and|with|from|here|are|most|feature|varying|only|must|there|bring|recommended|open|daily|permitted|hours|planning|safety|difficulty|accessibility)\b/g) ?? [];
  return spanishMarkers.length >= 3 && spanishMarkers.length > englishMarkers.length;
}

function eventsCalendarFallback(
  manifest: SourceManifestEntry[],
  message: string,
  language: ChatLanguagePreference,
): ChatResponse {
  const entry = manifest.find((source) => source.id === "events-guide");
  if (!entry?.url) return sourceVerificationFallback(undefined, language);
  const source: ChatSource = {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    sourceType: entry.sourceType,
  };
  const spanish =
    language === "es" ||
    /\b(?:eventos|proximos|fechas|calendario)\b/.test(
      normalizeForMatching(message),
    );
  return {
    status: "answered",
    answer: spanish
      ? "No puedo confirmar una fecha específica para los próximos eventos con la información consultada. Las fechas pueden cambiar; consulta la página oficial de Events & Parties de Elachee para ver el calendario actualizado."
      : "I couldn't confirm a specific upcoming event date from the current Elachee information. Event dates can change, so check the official Events & Parties page for the latest calendar.",
    sources: [source],
    contactRecommended: false,
  };
}

function featuredAnswerIsRelevant(
  category: FeaturedQuestion,
  response: ChatResponse,
): boolean {
  const answer = normalizeForMatching(response.answer);
  if (response.status !== "answered") return true;

  switch (category) {
    case "visit":
      return (
        hasOfficialPage(response, /\/hours\/?$/) &&
        hasOfficialPage(response, /\/parking-admissions\/?$/) &&
        hasOfficialPage(response, /\/visit\/?$/) &&
        /\$\s*10\b/.test(answer) &&
        /\$\s*5\b/.test(answer) &&
        /sunset|atardecer|puesta del sol/.test(answer)
      );
    case "trails":
      return (
        hasOfficialPage(response, /\/hiking-trails\/?$/) &&
        /\b\d+(?:[.,]\d+)?\s*-?\s*(?:miles?|millas?|mi)\b/.test(answer) &&
        hasAnyTerm(answer, [
          "ed dodd",
          "geiger",
          "elachee creek",
          "ridge trail",
          "upland trail",
          "bridge loop",
          "lake loop",
          "backcountry trail",
        ])
      );
    case "programs":
      return (
        hasOfficialPage(response, /\/camps-programs(?:\/|$)/) &&
        ["sprouts", "nature academy", "camp elachee", "homeschool"]
          .filter((term) => answer.includes(term)).length >= 2
      );
    case "fieldTrips":
      return (
        hasOfficialPage(response, /\/field-trips(?:\/|$)/) &&
        /pre-?k|prekindergarten|preescolar/.test(answer) &&
        /grade|grades|grado|grados|k-?12/.test(answer) &&
        hasAnyTerm(answer, ["astronomy", "astronomia", "animals", "animales", "geology", "geologia", "plants", "plantas", "water", "agua"]) &&
        hasAnyTerm(answer, ["outreach", "floating classroom", "aula flotante", "on-site", "onsite", "en las instalaciones", "en tu aula", "escuelas"]) &&
        /request|form|solicitar|formulario/.test(answer)
      );
    case "events":
      return (
        hasOfficialPage(response, /\/(?:events(?:-parties)?|upcoming-event)(?:\/|$)/) &&
        (/(?:\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2}\b|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})\b)/.test(answer) || /no confirmed (?:upcoming )?(?:events?|future event dates)|could not confirm|can't confirm|no puedo confirmar|sin fechas futuras confirmadas/.test(answer)) &&
        !/\b(?:19|20)(?:st|nd|rd|th)[ -]?centur|dates? (?:concluded|ended)|earlier in \d{4}|past years?/.test(answer)
      );
    case "hours":
      return (
        hasOfficialPage(response, /\/hours\/?$/) &&
        hasOfficialPage(response, /\/parking-admissions\/?$/) &&
        /\$\s*10\b/.test(answer) &&
        /\$\s*5\b/.test(answer) &&
        /sunset|atardecer|puesta del sol/.test(answer) &&
        /visitor center|centro de visitantes/.test(answer) &&
        /trail|senderos?/.test(answer)
      );
  }
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
  const category = featuredQuestion(request.message);
  const needsFeaturedRetry =
    category !== undefined &&
    (response.status === "not_found" ||
      response.status === "conflicting_information" ||
      !featuredAnswerIsRelevant(category, response) ||
      (expectsSpanishResponse(request) &&
        response.status === "answered" &&
        !answerIsPredominantlySpanish(response.answer)));
  if (
    request.history.length === 0 &&
    needsFeaturedRetry
  ) {
    if (category) {
      try {
        const retryRequest: ChatRequest = {
          ...request,
          history: [],
          message: `${FEATURED_RETRY_QUERIES[category]}${
            expectsSpanishResponse(request)
              ? " Provide the complete answer in Spanish, preserving official Elachee names."
              : ""
          }`,
        };
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
        if (retryResponse.status === "not_found") {
          if (category === "events") {
            return eventsCalendarFallback(
              options.manifest,
              request.message,
              request.language,
            );
          }
          return response.status === "answered"
            ? sourceVerificationFallback(undefined, request.language)
            : response;
        }
        if (category === "events" && retryResponse.status === "conflicting_information") {
          return eventsCalendarFallback(
            options.manifest,
            request.message,
            request.language,
          );
        }
        if (
          expectsSpanishResponse(request) &&
          retryResponse.status === "answered" &&
          !answerIsPredominantlySpanish(retryResponse.answer)
        ) {
          return category === "events"
            ? eventsCalendarFallback(
                options.manifest,
                request.message,
                request.language,
              )
            : sourceVerificationFallback(undefined, request.language);
        }
        return featuredAnswerIsRelevant(category, retryResponse)
          ? retryResponse
          : category === "events"
            ? eventsCalendarFallback(
                options.manifest,
                request.message,
                request.language,
              )
            : sourceVerificationFallback(undefined, request.language);
      } catch {
        return category === "events"
          ? eventsCalendarFallback(
              options.manifest,
              request.message,
              request.language,
            )
          : response;
      }
    }
  }
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
