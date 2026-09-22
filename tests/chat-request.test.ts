import { describe, expect, it } from "vitest";

import { QUICK_ACTIONS } from "@/components/chatbot/QuickActions";
import { MAX_HISTORY_CONTENT_LENGTH } from "@/lib/chat/limits";
import {
  buildChatRequest,
  captureMessageForSubmit,
} from "@/lib/chat/request";
import { validateChatRequest } from "@/lib/security/input-validation";

describe("client chat request builder", () => {
  it("creates the exact typed-message payload with a trimmed message", () => {
    expect(buildChatRequest("  What should I know before visiting Elachee?  ", [])).toEqual({
      success: true,
      payload: {
        message: "What should I know before visiting Elachee?",
        history: [],
        language: "auto",
      },
    });
  });

  it("sends a quick action through the same payload builder", () => {
    const action = QUICK_ACTIONS.find(({ label }) => label === "Plan my visit");
    expect(action).toBeDefined();
    expect(buildChatRequest(action?.question, [])).toEqual({
      success: true,
      payload: {
        message: "What should I know before visiting Elachee?",
        history: [],
        language: "auto",
      },
    });
  });

  it("captures the current input before a caller clears its state", () => {
    let input = "  I need food.  ";
    const messageToSend = captureMessageForSubmit(input);
    input = "";
    expect(messageToSend).toBe("I need food.");
    expect(input).toBe("");
  });

  it("does not treat a form event as a message", () => {
    expect(
      buildChatRequest({ preventDefault() {} }, []),
    ).toEqual({ success: false, reason: "invalid_message" });
  });

  it("strips every UI-only field from history", () => {
    const result = buildChatRequest("Who should I contact?", [
      {
        role: "user",
        content: "I applied for assistance.",
        includeInHistory: true,
        id: "ui-id",
        timestamp: 123,
        sources: [{ id: "source" }],
        status: "answered",
        pending: false,
        isLoading: false,
        error: undefined,
        contactRecommended: true,
      },
    ]);
    expect(result).toEqual({
      success: true,
      payload: {
        message: "Who should I contact?",
        history: [
          { role: "user", content: "I applied for assistance." },
        ],
        language: "auto",
      },
    });
    if (result.success) {
      expect(JSON.stringify(result.payload)).not.toContain("undefined");
    }
  });

  it("includes a validated explicit language preference", () => {
    expect(buildChatRequest("¿Dónde puedo donar alimentos?", [], "es")).toEqual({
      success: true,
      payload: {
        message: "¿Dónde puedo donar alimentos?",
        history: [],
        language: "es",
      },
    });
  });

  it("excludes welcome, loading, error, empty, and unsupported-role messages", () => {
    const result = buildChatRequest("What about Saturday?", [
      { role: "assistant", content: "Welcome", includeInHistory: false },
      { role: "assistant", content: "Loading", includeInHistory: false },
      { role: "assistant", content: "Error", includeInHistory: false },
      { role: "assistant", content: "   ", includeInHistory: true },
      { role: "bot", content: "Not a valid role", includeInHistory: true },
      { role: "model", content: "Not a valid role", includeInHistory: true },
      { role: "user", content: "I need food.", includeInHistory: true },
      {
        role: "assistant",
        content: "Elachee offers visitor information.",
        includeInHistory: true,
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.history).toEqual([
        { role: "user", content: "I need food." },
        {
          role: "assistant",
          content: "Elachee offers visitor information.",
        },
      ]);
    }
  });

  it("rejects empty messages and preserves multiline punctuation", () => {
    expect(buildChatRequest(" \n ", [])).toEqual({
      success: false,
      reason: "empty_message",
    });
    const message = "I haven't heard back.\nWho should I contact?";
    const result = buildChatRequest(message, []);
    expect(result.success && result.payload.message).toBe(message);
  });

  it("keeps only the four most recent valid messages", () => {
    const result = buildChatRequest(
      "What about Saturday?",
      Array.from({ length: 9 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message ${index}`,
        includeInHistory: true,
      })),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.history).toHaveLength(4);
      expect(result.payload.history[0]?.content).toBe("message 5");
      expect(result.payload.history.at(-1)?.content).toBe("message 8");
    }
  });

  it("preserves backend-sized assistant answers and produces schema-valid follow-up history", () => {
    const previousAnswer = "A".repeat(MAX_HISTORY_CONTENT_LENGTH);
    const result = buildChatRequest("Can you explain that more simply?", [
      { role: "user", content: "I need food.", includeInHistory: true },
      {
        role: "assistant",
        content: previousAnswer,
        includeInHistory: true,
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.history[1]?.content).toHaveLength(
        MAX_HISTORY_CONTENT_LENGTH,
      );
      expect(validateChatRequest(result.payload).success).toBe(true);
    }
  });
});
