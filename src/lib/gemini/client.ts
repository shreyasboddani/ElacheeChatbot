import { GoogleGenAI, type HttpOptions } from "@google/genai";

import { GEMINI_REQUEST_TIMEOUT_MS } from "@/lib/chat/limits";
import type {
  GroundedInteraction,
  GroundedInteractionClient,
} from "@/lib/gemini/chat";
import type { FileCitationAnnotation } from "@/lib/gemini/citations";

export function createGeminiClient(
  apiKey: string,
  httpOptions?: HttpOptions,
): GoogleGenAI {
  return new GoogleGenAI({ apiKey, ...(httpOptions ? { httpOptions } : {}) });
}

function normalizeAnnotation(value: unknown): FileCitationAnnotation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const annotation = value as Record<string, unknown>;
  if (annotation.type !== "file_citation") return undefined;
  return {
    type: "file_citation",
    ...(typeof annotation.file_name === "string"
      ? { file_name: annotation.file_name }
      : {}),
    ...(typeof annotation.document_uri === "string"
      ? { document_uri: annotation.document_uri }
      : {}),
    ...(typeof annotation.source === "string"
      ? { source: annotation.source }
      : {}),
    ...(annotation.custom_metadata !== undefined
      ? { custom_metadata: annotation.custom_metadata }
      : {}),
  };
}

function normalizeInteraction(value: unknown): GroundedInteraction {
  if (!value || typeof value !== "object") return { steps: [] };
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.steps)) return { steps: [] };

  const steps = response.steps.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const record = step as Record<string, unknown>;
    if (record.type !== "model_output" || !Array.isArray(record.content)) {
      return [];
    }

    const content = record.content.flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const contentRecord = block as Record<string, unknown>;
      if (contentRecord.type !== "text" || typeof contentRecord.text !== "string") {
        return [];
      }
      const annotations = Array.isArray(contentRecord.annotations)
        ? contentRecord.annotations
            .map(normalizeAnnotation)
            .filter((item): item is FileCitationAnnotation => Boolean(item))
        : [];
      return [
        {
          type: "text" as const,
          text: contentRecord.text,
          ...(annotations.length > 0 ? { annotations } : {}),
        },
      ];
    });

    return [{ type: "model_output", content }];
  });

  return {
    ...(typeof response.status === "string" ? { status: response.status } : {}),
    steps,
  };
}

export function createGroundedInteractionClient(
  apiKey: string,
): GroundedInteractionClient {
  const ai = createGeminiClient(apiKey);
  return {
    async create(params) {
      const interaction = await ai.interactions.create(params, {
        timeout: GEMINI_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      });
      return normalizeInteraction(interaction);
    },
  };
}
