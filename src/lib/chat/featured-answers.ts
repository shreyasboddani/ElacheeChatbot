import { createHash } from "node:crypto";

import storedFeaturedAnswers from "@/generated/featured-answers.json";
import rawManifest from "@/generated/knowledge-manifest.json";
import { CHAT_UI_COPY, chatUiLanguage, type ChatUiLanguage } from "@/lib/chat/language";
import { parseChatResponse } from "@/lib/chat/response";
import { featuredQuestion } from "@/lib/gemini/chat";
import type { ChatResponse } from "@/lib/knowledge/types";
import type { ChatRequest } from "@/lib/security/input-validation";

// Pre-generated answers for the suggested-question buttons. They are produced
// by `npm run knowledge:precompute` (run by the protected sync workflow after
// every knowledge change) and are only served while the knowledge manifest is
// byte-for-byte the one they were generated from. After a crawl changes the
// corpus the fingerprint no longer matches, so the chatbot falls back to a
// live grounded Gemini call until the answers are regenerated.

export interface StoredFeaturedAnswer {
  language: ChatUiLanguage;
  question: string;
  response: ChatResponse;
}

export interface FeaturedAnswerStore {
  corpusFingerprint: string | null;
  generatedAt: string | null;
  answers: StoredFeaturedAnswer[];
}

let bundledFingerprint: string | undefined;

export function corpusFingerprint(manifest: unknown = rawManifest): string {
  if (manifest === rawManifest && bundledFingerprint) return bundledFingerprint;
  const value = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  if (manifest === rawManifest) bundledFingerprint = value;
  return value;
}

export function normalizeFeaturedQuestion(message: string): string {
  return message.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Questions whose answers are stable between crawls. Event answers depend on
// today's date, so they always use a live call.
export function precomputableQuestions(): Array<{
  language: ChatUiLanguage;
  question: string;
}> {
  return (["en", "es"] as const).flatMap((language) =>
    CHAT_UI_COPY[language].quickActions
      .map((action) => action.question)
      .filter((question) => featuredQuestion(question) !== "events")
      .map((question) => ({ language, question })),
  );
}

export function getPrecomputedAnswer(
  request: ChatRequest,
  store: FeaturedAnswerStore = storedFeaturedAnswers as FeaturedAnswerStore,
  fingerprint: string = corpusFingerprint(),
): ChatResponse | undefined {
  if (request.history.length > 0) return undefined;
  if (!store.corpusFingerprint || store.corpusFingerprint !== fingerprint) {
    return undefined;
  }
  const language = chatUiLanguage(request.language);
  const key = normalizeFeaturedQuestion(request.message);
  const match = store.answers.find(
    (entry) =>
      entry.language === language &&
      normalizeFeaturedQuestion(entry.question) === key,
  );
  if (!match) return undefined;
  const response = parseChatResponse(match.response);
  return response?.status === "answered" ? response : undefined;
}
