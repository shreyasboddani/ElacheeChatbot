import { NextRequest } from "next/server";

import {
  rateLimitedResponse,
  sensitiveInformationResponse,
  serviceUnavailableResponse,
} from "@/lib/contact-fallback";
import {
  focusConversationalQuery,
  getLocalConversationalResponse,
} from "@/lib/chat/local-response";
import {
  isChatLanguagePreference,
  type ChatLanguagePreference,
} from "@/lib/chat/language";
import { getRuntimeConfig } from "@/lib/config";
import { askGroundedQuestion } from "@/lib/gemini/chat";
import { createGroundedInteractionClient } from "@/lib/gemini/client";
import { getKnowledgeManifest } from "@/lib/knowledge/manifest";
import type { ChatResponse } from "@/lib/knowledge/types";
import {
  MAX_REQUEST_BYTES,
  validateChatRequest,
} from "@/lib/security/input-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { containsLikelySensitiveInformation } from "@/lib/security/sensitive-data";

export const runtime = "nodejs";
export const maxDuration = 60;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: ChatResponse, status = 200, extraHeaders?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });
}

function invalidRequest(answer: string): ChatResponse {
  return {
    status: "invalid_request",
    answer,
    sources: [],
    contactRecommended: false,
  };
}

function clientKey(request: NextRequest): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "anonymous";
  return forwarded.split(",")[0]?.trim().slice(0, 128) || "anonymous";
}

function requestedLanguage(request: NextRequest): ChatLanguagePreference {
  const language = request.headers.get("x-chat-language");
  return isChatLanguagePreference(language) ? language : "auto";
}

function safeServiceErrorDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return { type: typeof value };
  const error = value as Record<string, unknown>;
  return {
    type: value.constructor?.name || "Error",
    ...(typeof error.name === "string" ? { name: error.name } : {}),
    ...(typeof error.status === "number" || typeof error.status === "string"
      ? { status: error.status }
      : {}),
    ...(typeof error.code === "number" || typeof error.code === "string"
      ? { code: error.code }
      : {}),
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  const headerLanguage = requestedLanguage(request);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(invalidRequest("That message is too large to process."), 413);
  }

  const rateLimit = checkRateLimit(clientKey(request));
  if (!rateLimit.allowed) {
    return jsonResponse(
      rateLimitedResponse(rateLimit.retryAfterSeconds, headerLanguage),
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(
      invalidRequest("The chat request must use application/json."),
      415,
    );
  }

  let rawBody = "";
  try {
    const reader = request.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let bytesRead = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          if (bytesRead > MAX_REQUEST_BYTES) {
            // Stop consuming immediately; cancellation must not delay rejection.
            void reader.cancel().catch(() => undefined);
            return jsonResponse(invalidRequest("That message is too large to process."), 413);
          }
          rawBody += decoder.decode(value, { stream: true });
        }
        rawBody += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
  } catch {
    return jsonResponse(invalidRequest("The request could not be read."), 400);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(invalidRequest("The request must be valid JSON."), 400);
  }

  const validation = validateChatRequest(body);
  if (!validation.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Invalid chat request shape", { issues: validation.issues });
    }
    return jsonResponse(invalidRequest(validation.reason), 400);
  }

  const language = validation.data.language;

  if (
    containsLikelySensitiveInformation(validation.data.message) ||
    validation.data.history.some((item) =>
      containsLikelySensitiveInformation(item.content),
    )
  ) {
    return jsonResponse(sensitiveInformationResponse(language), 200);
  }

  const manifest = getKnowledgeManifest();
  const localResponse = getLocalConversationalResponse(
    validation.data.message,
    manifest,
    language,
  );
  if (localResponse) return jsonResponse(localResponse);

  const config = getRuntimeConfig();
  if (!config.apiKey || !config.fileSearchStore) {
    return jsonResponse(serviceUnavailableResponse(language), 503);
  }

  try {
    const focusedMessage = focusConversationalQuery(validation.data.message);
    const response = await askGroundedQuestion(
      createGroundedInteractionClient(config.apiKey),
      {
        ...validation.data,
        message: focusedMessage,
      },
      {
        model: config.model,
        fileSearchStore: config.fileSearchStore,
        manifest,
      },
    );
    return jsonResponse(response);
  } catch (error) {
    console.error("Grounded chat service failed", safeServiceErrorDetails(error));
    return jsonResponse(serviceUnavailableResponse(language), 503);
  }
}
