import { describe, expect, it } from "vitest";

import { CHAT_STATUSES, parseChatResponse } from "@/lib/chat/response";
import { MAX_ASSISTANT_ANSWER_LENGTH } from "@/lib/chat/limits";

describe("client API response handling", () => {
  it.each(CHAT_STATUSES)("accepts the %s API status", (status) => {
    const sources =
      status === "answered"
        ? [
            {
              id: "staff-answer",
              title: "Information provided by Elachee staff",
              sourceType: "manager_faq",
            },
          ]
        : [];
    expect(
      parseChatResponse({
        status,
        answer: `Response for ${status}`,
        sources,
        contactRecommended: status !== "answered",
      })?.status,
    ).toBe(status);
  });

  it("rejects an answered response without a valid mapped source", () => {
    expect(
      parseChatResponse({
        status: "answered",
        answer: "Unsupported answer",
        sources: [],
        contactRecommended: false,
      }),
    ).toBeUndefined();
  });

  it("rejects malformed response fields", () => {
    expect(
      parseChatResponse({
        status: "unknown",
        answer: "No",
        sources: [],
        contactRecommended: false,
      }),
    ).toBeUndefined();
  });

  it("rejects empty or oversized assistant text", () => {
    const response = {
      status: "not_found",
      sources: [],
      contactRecommended: true,
    };
    expect(parseChatResponse({ ...response, answer: "   " })).toBeUndefined();
    expect(
      parseChatResponse({
        ...response,
        answer: "x".repeat(MAX_ASSISTANT_ANSWER_LENGTH + 1),
      }),
    ).toBeUndefined();
  });
});
