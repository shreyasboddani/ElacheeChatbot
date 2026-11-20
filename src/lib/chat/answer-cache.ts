import { corpusFingerprint, normalizeFeaturedQuestion } from "@/lib/chat/featured-answers";
import { chatUiLanguage } from "@/lib/chat/language";
import { currentGeorgiaDate } from "@/lib/gemini/prompts";
import type { ChatResponse } from "@/lib/knowledge/types";
import type { ChatRequest } from "@/lib/security/input-validation";

// Per-instance cache of verified live answers to identical first-turn
// questions. Warm serverless instances serve many visitors, so repeated
// questions ("are dogs allowed?") reuse one Gemini call. The key includes the
// knowledge fingerprint (a crawl update invalidates it) and the Georgia date
// (date-relative answers such as events never outlive the day).

const MAX_ENTRIES = 300;
const TTL_MS = 6 * 60 * 60 * 1_000;

interface Entry {
  response: ChatResponse;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

function cacheKey(request: ChatRequest, now: Date): string | undefined {
  if (request.history.length > 0) return undefined;
  return [
    corpusFingerprint(),
    currentGeorgiaDate(now),
    chatUiLanguage(request.language),
    request.language,
    normalizeFeaturedQuestion(request.message),
  ].join("\u0000");
}

export function getCachedAnswer(
  request: ChatRequest,
  now = new Date(),
): ChatResponse | undefined {
  const key = cacheKey(request, now);
  if (!key) return undefined;
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now.getTime()) {
    entries.delete(key);
    return undefined;
  }
  // Refresh recency for LRU eviction.
  entries.delete(key);
  entries.set(key, entry);
  return entry.response;
}

export function cacheAnswer(
  request: ChatRequest,
  response: ChatResponse,
  now = new Date(),
): void {
  // Only verified answers are reused; fallbacks may be transient.
  if (response.status !== "answered") return;
  const key = cacheKey(request, now);
  if (!key) return;
  entries.delete(key);
  entries.set(key, { response, expiresAt: now.getTime() + TTL_MS });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function resetAnswerCacheForTests(): void {
  entries.clear();
}
