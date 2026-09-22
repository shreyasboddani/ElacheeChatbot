import { describe, expect, it } from "vitest";

import {
  focusConversationalQuery,
  getLocalConversationalResponse,
} from "@/lib/chat/local-response";
import type { SourceManifestEntry } from "@/lib/knowledge/types";

const officialDocuments: SourceManifestEntry[] = [
  {
    id: "elachee-staff-guide",
    fileName: "official_document__elachee-staff-guide.pdf",
    documentPath:
      "knowledge/generated/prepared/official_document__elachee-staff-guide.pdf",
    title: "Elachee Staff Guide - Version 1.0",
    url: "https://elachee.org/resources/staff-guide",
    sourceType: "official_document",
    priority: 75,
  },
  {
    id: "elachee-program-guide",
    fileName: "official_document__elachee-program-guide.pdf",
    documentPath:
      "knowledge/generated/prepared/official_document__heart-of-service-july-2026.pdf",
    title: "Elachee Program Guide",
    url: "https://elachee.org/camps-programs",
    sourceType: "official_document",
    priority: 75,
  },
];

describe("local conversational responses", () => {
  it.each(["hello", "Hi!", "good morning", "HEY THERE?"])(
    "recognizes a standalone greeting: %j",
    (message) => {
      const response = getLocalConversationalResponse(message);

      expect(response?.status).toBe("answered");
      expect(response?.contactRecommended).toBe(false);
      expect(response?.sources[0]?.url).toBe("https://elachee.org/");
    },
  );

  it.each(["hii", "hellooo", "heyy there", "helo there!"])(
    "recognizes a harmlessly misspelled standalone greeting: %j",
    (message) => {
      expect(getLocalConversationalResponse(message)?.status).toBe("answered");
    },
  );

  it.each([
    ["hola", "\u00a1Hola!"],
    ["namaste", "Namaste!"],
    ["salaam", "Ahlan!"],
    ["bonjour", "Bonjour !"],
    ["kumusta", "Kumusta!"],
  ])("answers a common multilingual greeting locally in Auto: %j", (message, expected) => {
    const response = getLocalConversationalResponse(message, [], "auto");
    expect(response?.status).toBe("answered");
    expect(response?.answer).toContain(expected);
  });

  it("honors an explicit response language for a greeting", () => {
    expect(getLocalConversationalResponse("hola", [], "en")?.answer).toMatch(
      /^Hi! /,
    );
    expect(getLocalConversationalResponse("hello", [], "es")?.answer).toMatch(
      /^\u00a1Hola! /,
    );
  });

  it.each([
    [
      "Hii, pls who can I contcat about trails please?",
      "who can i contcat about trails",
    ],
    ["Hello there - what are your hours, thanks", "what are your hours"],
    ["Good afternoon! I need visit information.", "i need visit information"],
  ])("focuses the substantive query without changing its meaning", (message, expected) => {
    expect(focusConversationalQuery(message)).toBe(expected);
  });

  it("carries only prior user questions into a context-dependent follow-up", () => {
    expect(
      focusConversationalQuery("What about Saturday?", [
        { role: "user", content: "Are dogs allowed on Elachee hiking trails?" },
        {
          role: "assistant",
          content: "Leashed dogs are allowed on Sundays only.",
        },
      ]),
    ).toBe(
      "are dogs allowed on elachee hiking trails on saturday?",
    );
  });

  it("carries a topic anchor through consecutive short follow-ups", () => {
    expect(
      focusConversationalQuery("Are they allowed on Sundays?", [
        { role: "user", content: "Are dogs allowed on Elachee hiking trails?" },
        { role: "assistant", content: "Dogs are allowed on Sundays." },
        { role: "user", content: "What about Saturday?" },
        { role: "assistant", content: "No, Saturday is not allowed." },
      ]),
    ).toBe(
      "are dogs allowed on elachee hiking trails on sundays?",
    );
  });

  it("keeps explanation requests tied to the earlier Elachee topic", () => {
    expect(
      focusConversationalQuery("Can you explain that more simply?", [
        { role: "user", content: "Are dogs allowed on Elachee hiking trails?" },
        { role: "assistant", content: "Dogs are allowed on Sundays only." },
      ]),
    ).toBe(
      "are dogs allowed on elachee hiking trails can you explain that more simply",
    );
  });

  it.each([
    "what questions can You answer",
    "What can you help me with?",
    "which topics can i ask?",
  ])("explains supported question areas: %j", (message) => {
    expect(getLocalConversationalResponse(message)?.answer).toContain(
      "trails",
    );
  });

  it("does not intercept an organization-information question", () => {
    expect(
      getLocalConversationalResponse(
        "Hello, who handles trails?",
      ),
    ).toBeUndefined();
  });

  it.each([
    "staff guide",
    "the staff guide",
    "hi do u have access to the staff guide?",
    "Hello, can you help me with the staff guide?",
    "Good afternoon - do you know about the staff guide?",
    "hii do u hav acess to the staf guide?",
    "helo can u halp with the staff guude?",
    "do u have access to the staff guide?",
    "Can you read the Elachee staff guide?",
    "Are you able to reference the staff guide?",
    "Can you help me with the staff guide?",
    "I need help with the staff guide.",
    "Do you know about the staff guide?",
  ])("confirms access only from the registered official document: %j", (message) => {
    const response = getLocalConversationalResponse(message, officialDocuments);

    expect(response).toEqual(
      expect.objectContaining({
        status: "answered",
        contactRecommended: false,
        sources: [
          expect.objectContaining({
            id: "elachee-staff-guide",
            url: "https://elachee.org/resources/staff-guide",
            sourceType: "official_document",
          }),
        ],
      }),
    );
    expect(response?.answer).toMatch(/^Yes/);
    expect(response?.answer).toContain("Elachee Staff Guide");
    expect(response?.answer).toContain("What would you like to know?");
  });

  it("sends factual staff-guide questions through grounded File Search", () => {
    expect(
      getLocalConversationalResponse(
        "What does the staff guide say about program requirements?",
        officialDocuments,
      ),
    ).toBeUndefined();
  });

  it("does not claim access to an unregistered or ambiguous document", () => {
    expect(
      getLocalConversationalResponse(
        "Do you have access to my private registration?",
        officialDocuments,
      ),
    ).toBeUndefined();
    expect(
      getLocalConversationalResponse(
        "Hii, do u hav acess to my private registration?",
        officialDocuments,
      ),
    ).toBeUndefined();
    expect(
      getLocalConversationalResponse(
        "Do you have access to that document?",
        officialDocuments,
      ),
    ).toBeUndefined();
  });
});
