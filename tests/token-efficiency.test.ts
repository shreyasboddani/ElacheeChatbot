// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cacheAnswer,
  getCachedAnswer,
  resetAnswerCacheForTests,
} from "@/lib/chat/answer-cache";
import {
  corpusFingerprint,
  getPrecomputedAnswer,
  precomputableQuestions,
  type FeaturedAnswerStore,
} from "@/lib/chat/featured-answers";
import { CHAT_UI_COPY } from "@/lib/chat/language";
import { askGroundedQuestion, featuredQuestion } from "@/lib/gemini/chat";
import type { ChatResponse, SourceManifestEntry } from "@/lib/knowledge/types";

const answer: ChatResponse = {
  status: "answered",
  answer: "Trails are open daily from 7 AM to sunset.",
  sources: [
    {
      id: "web-hours",
      title: "Hours",
      url: "https://elachee.org/hours",
      sourceType: "official_website",
    },
  ],
  contactRecommended: false,
};

const question = CHAT_UI_COPY.en.quickActions[0].question;

function store(fingerprint: string | null): FeaturedAnswerStore {
  return {
    corpusFingerprint: fingerprint,
    generatedAt: "2026-11-20T00:00:00.000Z",
    answers: [{ language: "en", question, response: answer }],
  };
}

describe("precomputed suggested-question answers", () => {
  it("serves a stored answer only for the matching knowledge version", () => {
    const request = { message: question, history: [], language: "auto" as const };
    expect(getPrecomputedAnswer(request, store("abc"), "abc")).toEqual(answer);
    // A crawl changed the corpus: never serve the stale answer.
    expect(getPrecomputedAnswer(request, store("abc"), "def")).toBeUndefined();
    expect(getPrecomputedAnswer(request, store(null), "abc")).toBeUndefined();
  });

  it("matches despite case and spacing, but not follow-ups or other languages", () => {
    const loose = `  ${question.toUpperCase().replace(/ /g, "  ")} `;
    expect(
      getPrecomputedAnswer({ message: loose, history: [], language: "en" }, store("x"), "x"),
    ).toEqual(answer);
    expect(
      getPrecomputedAnswer(
        {
          message: question,
          history: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "Hello!" },
          ],
          language: "auto",
        },
        store("x"),
        "x",
      ),
    ).toBeUndefined();
    expect(
      getPrecomputedAnswer({ message: question, history: [], language: "es" }, store("x"), "x"),
    ).toBeUndefined();
  });

  it("never precomputes date-dependent event answers", () => {
    const questions = precomputableQuestions();
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every(({ question: q }) => featuredQuestion(q) !== "events")).toBe(true);
  });

  it("fingerprints the knowledge manifest content", () => {
    expect(corpusFingerprint([{ id: "a" }])).not.toBe(corpusFingerprint([{ id: "b" }]));
    expect(corpusFingerprint()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("live answer cache", () => {
  beforeEach(() => resetAnswerCacheForTests());

  const request = { message: "Are dogs allowed?", history: [], language: "auto" as const };

  it("reuses a verified first-turn answer for the same question", () => {
    const now = new Date("2026-11-20T15:00:00Z");
    cacheAnswer(request, answer, now);
    expect(getCachedAnswer({ ...request, message: "are  DOGS allowed?" }, now)).toEqual(answer);
  });

  it("does not cache fallbacks or follow-ups, and expires daily", () => {
    const now = new Date("2026-11-20T15:00:00Z");
    cacheAnswer(request, { ...answer, status: "not_found" }, now);
    expect(getCachedAnswer(request, now)).toBeUndefined();

    const followUp = {
      ...request,
      history: [
        { role: "user" as const, content: "hi" },
        { role: "assistant" as const, content: "Hello!" },
      ],
    };
    cacheAnswer(followUp, answer, now);
    expect(getCachedAnswer(followUp, now)).toBeUndefined();

    cacheAnswer(request, answer, now);
    expect(getCachedAnswer(request, new Date("2026-11-21T15:00:00Z"))).toBeUndefined();
  });
});

describe("featured retry economy", () => {
  const parkingSource: SourceManifestEntry = {
    id: "web-parking-admissions",
    fileName: "website__web-parking-admissions.md",
    documentPath: "knowledge/generated/prepared/website__web-parking-admissions.md",
    title: "Parking & Admissions",
    url: "https://elachee.org/parking-admissions",
    sourceType: "official_website",
    priority: 50,
  };

  function interaction(text: string) {
    return {
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "text" as const,
              text,
              annotations: [{ type: "file_citation", file_name: parkingSource.fileName }],
            },
          ],
        },
      ],
    };
  }

  it("keeps a direct cited answer to a simple topic question with one call", async () => {
    const client = {
      create: vi.fn().mockResolvedValue(
        interaction("Parking is $5 per vehicle, paid to the Chicopee Woods Area Park Commission."),
      ),
    };
    const result = await askGroundedQuestion(
      client,
      { message: "Where do I park?", history: [], language: "auto" },
      { model: "m", fileSearchStore: "s", manifest: [parkingSource] },
    );
    expect(result.status).toBe("answered");
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it("still requires the full bundle for the suggested-question button", async () => {
    const client = {
      create: vi.fn().mockResolvedValue(interaction("Parking is $5 per vehicle.")),
    };
    await askGroundedQuestion(
      client,
      { message: question, history: [], language: "auto" },
      { model: "m", fileSearchStore: "s", manifest: [parkingSource] },
    );
    expect(client.create).toHaveBeenCalledTimes(2);
  });
});
