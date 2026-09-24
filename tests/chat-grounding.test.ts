import { describe, expect, it, vi } from "vitest";

import {
  askGroundedQuestion,
  interpretGroundedInteraction,
} from "@/lib/gemini/chat";
import { ELACHEE } from "@/lib/config";
import { CHAT_UI_COPY } from "@/lib/chat/language";
import type { SourceManifestEntry } from "@/lib/knowledge/types";

const staffSource: SourceManifestEntry = {
  id: "office-hours",
  fileName: "manager_faq__office-hours.md",
  documentPath: "knowledge/generated/prepared/manager_faq__office-hours.md",
  title: "What are your office hours?",
  sourceType: "manager_faq",
  priority: 100,
};

function interaction(
  status: "answered" | "not_found" | "conflicting_information",
  withCitation = true,
  answer = "A supported answer.",
  citationId: string | string[] = "office-hours",
) {
  return {
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status, answer }),
            annotations: withCitation
              ? (Array.isArray(citationId) ? citationId : [citationId]).map((id) => ({
                  type: "file_citation",
                  custom_metadata: { source_id: id },
                }))
              : [],
          },
        ],
      },
    ],
  };
}

describe("grounded interaction interpretation", () => {
  it("returns a supported answer with a mapped source", () => {
    const result = interpretGroundedInteraction(interaction("answered"), [
      staffSource,
    ]);
    expect(result.status).toBe("answered");
    expect(result.sources[0]?.sourceType).toBe("manager_faq");
  });

  it("never returns a third-party phone number found in retrieved material", () => {
    const outsidePhone = ["1", "800", "366", "2661"].join("-");
    const result = interpretGroundedInteraction(
      interaction(
        "answered",
        true,
        `Call the wildlife hotline at ${outsidePhone}.`,
      ),
      [staffSource],
    );

    expect(result.status).toBe("not_found");
    expect(result.answer).toContain(ELACHEE.contact.phone);
    expect(result.answer).not.toContain(outsidePhone);
  });

  it("allows Elachee's number when formatted with a country code", () => {
    const result = interpretGroundedInteraction(
      interaction("answered", true, "Call Elachee at +1 (770) 535-1976."),
      [staffSource],
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("+1 (770) 535-1976");
  });

  it("falls back when an answer has no mapped citation", () => {
    const result = interpretGroundedInteraction(
      interaction("answered", false),
      [staffSource],
    );
    expect(result.status).toBe("not_found");
    expect(result.contactRecommended).toBe(true);
    expect(result.answer).toContain("could not safely verify");
    expect(result.answer).not.toContain("available information");
  });

  it("reserves the lack-of-content wording for a confirmed not-found result", () => {
    const result = interpretGroundedInteraction(interaction("not_found"), [
      staffSource,
    ]);

    expect(result.status).toBe("not_found");
    expect(result.answer).toContain("available information");
  });

  it("localizes a confirmed not-found fallback without trusting model prose", () => {
    const result = interpretGroundedInteraction(
      interaction("not_found"),
      [staffSource],
      "es",
    );

    expect(result.status).toBe("not_found");
    expect(result.answer).toContain("No pude encontrar una respuesta confirmada");
    expect(result.answer).not.toContain("A supported answer");
  });

  it("does not describe malformed model output as missing knowledge", () => {
    const result = interpretGroundedInteraction(
      {
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: "not valid JSON" }],
          },
        ],
      },
      [staffSource],
    );

    expect(result.status).toBe("not_found");
    expect(result.answer).toContain("could not safely verify");
    expect(result.answer).not.toContain("available information");
  });

  it("turns conflicting information into a contact fallback", () => {
    const result = interpretGroundedInteraction(
      interaction("conflicting_information"),
      [staffSource],
    );
    expect(result.status).toBe("conflicting_information");
    expect(result.contactRecommended).toBe(true);
  });

  it("blocks visitor-center schedule claims while the crawled page conflicts", () => {
    const visitSource: SourceManifestEntry = {
      id: "web-visit",
      fileName: "website__web-visit.md",
      documentPath: "knowledge/generated/prepared/website__web-visit.md",
      title: "Visit",
      url: "https://elachee.org/visit",
      sourceType: "official_website",
      priority: 50,
      conflictingTopics: ["visitor_center_hours"],
    };
    const request = {
      message: "What should I know before visiting Elachee?",
      history: [],
      language: "auto" as const,
    };
    const result = interpretGroundedInteraction(
      interaction(
        "answered",
        true,
        "The Visitor Center is open Wednesday through Friday from noon to 3 PM.",
        "web-visit",
      ),
      [visitSource],
      "auto",
      request,
    );

    expect(result.status).toBe("conflicting_information");
    expect(result.contactRecommended).toBe(true);
    expect(result.answer).not.toContain("Wednesday");
    expect(result.answer).toContain("official pages conflict about Visitor Center hours");
    expect(result.answer).toContain(ELACHEE.contact.phone);
  });

  it("does not guess which venue a general opening-hours question means", () => {
    const visitSource: SourceManifestEntry = {
      id: "web-visit",
      fileName: "website__web-visit.md",
      documentPath: "knowledge/generated/prepared/website__web-visit.md",
      title: "Visit",
      url: "https://elachee.org/visit",
      sourceType: "official_website",
      priority: 50,
      conflictingTopics: ["visitor_center_hours"],
    };
    const result = interpretGroundedInteraction(
      interaction("answered", true, "We are open Wednesday through Friday, noon to 3 PM.", "web-visit"),
      [visitSource],
      "auto",
      { message: "When are you open?", history: [], language: "auto" },
    );

    expect(result.status).toBe("conflicting_information");
    expect(result.answer).toContain("official pages conflict about Visitor Center hours");

    const trailResult = interpretGroundedInteraction(
      interaction(
        "answered",
        true,
        "Hiking trails are open daily from 7 AM to sunset.",
        "web-visit",
      ),
      [visitSource],
      "auto",
      { message: "What are the hiking trail hours?", history: [], language: "auto" },
    );
    expect(trailResult.status).toBe("answered");
  });

  it("uses the dedicated Hours page when the Visit page has conflicting hours", () => {
    const visitSource: SourceManifestEntry = {
      id: "web-visit",
      fileName: "website__web-visit.md",
      documentPath: "knowledge/generated/prepared/website__web-visit.md",
      title: "Visit",
      url: "https://elachee.org/visit",
      sourceType: "official_website",
      priority: 50,
      conflictingTopics: ["visitor_center_hours"],
    };
    const hoursSource: SourceManifestEntry = {
      id: "visitor-hours",
      fileName: "official_reference__visitor-hours.md",
      documentPath: "knowledge/generated/prepared/official_reference__visitor-hours.md",
      title: "Elachee Visitor Center and Chicopee Woods Trail Hours",
      url: "https://elachee.org/hours",
      sourceType: "official_reference",
      priority: 90,
    };
    const crawledHoursPage: SourceManifestEntry = {
      id: "web-hours",
      fileName: "website__web-hours.md",
      documentPath: "knowledge/generated/prepared/website__web-hours.md",
      title: "Hours",
      url: "https://elachee.org/hours/",
      sourceType: "official_website",
      priority: 50,
    };
    const result = interpretGroundedInteraction(
      interaction(
        "answered",
        true,
        "The Visitor Center is open Wednesday-Friday, noon-3 PM, and Saturday, 10 AM-4 PM. Chicopee Woods trails are open daily, 7 AM to sunset.",
        ["web-hours", "web-visit"],
      ),
      [visitSource, hoursSource, crawledHoursPage],
      "auto",
      {
        message: "What are the Visitor Center and trail hours?",
        history: [],
        language: "auto",
      },
    );

    expect(result.status).toBe("answered");
    expect(result.sources.map((source) => source.id)).toEqual([
      "web-hours",
      "web-visit",
    ]);
    expect(result.answer).toContain("trails are open daily");
  });

  it("uses a mocked Gemini interaction for a contextual follow-up", async () => {
    const client = {
      create: vi.fn().mockResolvedValue(interaction("answered")),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: "Who should I contact?",
        language: "auto",
        history: [
          {
            role: "user",
            content: "I registered my child for a Camp Elachee session.",
          },
          {
            role: "assistant",
            content: "Elachee staff can help with a program registration question.",
          },
        ],
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [staffSource],
      },
    );
    expect(result.status).toBe("answered");
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        input: expect.arrayContaining([
          expect.objectContaining({ type: "model_output" }),
          expect.objectContaining({ type: "user_input" }),
        ]),
      }),
    );
  });

  it("retries an ungrounded follow-up once without history", async () => {
    const client = {
      create: vi
        .fn()
        .mockResolvedValueOnce(interaction("answered", false, "Uncited answer."))
        .mockResolvedValueOnce(
          interaction(
            "answered",
            true,
            "No, dogs are not allowed on Elachee hiking trails on Saturdays.",
          ),
        ),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: "What about Saturday?",
        language: "auto",
        history: [
          {
            role: "user",
            content: "Are dogs allowed on Elachee hiking trails?",
          },
          { role: "assistant", content: "Dogs are allowed on Sundays only." },
        ],
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [staffSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("Saturdays");
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(client.create.mock.calls[0]?.[0].input.at(-1)?.content[0]?.text).toBe(
      "are dogs allowed on elachee hiking trails on saturday?",
    );
    expect(client.create.mock.calls[1]?.[0].input).toEqual([
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: "are dogs allowed on elachee hiking trails on saturday?",
          },
        ],
      },
    ]);
  });

  it("retries each preset topic with a focused File Search query when the first search misses", async () => {
    for (const language of ["en", "es"] as const) {
      for (const action of CHAT_UI_COPY[language].quickActions) {
        const client = {
          create: vi.fn().mockResolvedValue(interaction("not_found")),
        };
        await askGroundedQuestion(
          client,
          { message: action.question, language, history: [] },
          {
            model: "gemini-3.5-flash-lite",
            fileSearchStore: "fileSearchStores/test",
            manifest: [staffSource],
          },
        );

        expect(client.create, `${language}: ${action.label}`).toHaveBeenCalledTimes(2);
        const focusedQuery = client.create.mock.calls[1]?.[0].input[0];
        expect(focusedQuery?.type, `${language}: ${action.label}`).toBe("user_input");
        expect(focusedQuery?.content[0]?.text, `${language}: ${action.label}`).toMatch(/Elachee|Chicopee Woods/);
      }
    }
  });

  it("retries a preset answer whose citations do not cover the requested topic", async () => {
    const visitSource: SourceManifestEntry = {
      id: "web-visit",
      fileName: "website__web-visit.md",
      documentPath: "knowledge/generated/prepared/website__web-visit.md",
      title: "Visit",
      url: "https://elachee.org/visit",
      sourceType: "official_website",
      priority: 50,
    };
    const trailSource: SourceManifestEntry = {
      id: "trail-guide",
      fileName: "official_reference__trail-guide.md",
      documentPath: "knowledge/generated/prepared/official_reference__trail-guide.md",
      title: "Chicopee Woods Hiking Trail Guide",
      url: "https://elachee.org/visit/hiking-trails",
      sourceType: "official_reference",
      priority: 90,
    };
    const client = {
      create: vi
        .fn()
        .mockResolvedValueOnce(
          interaction(
            "answered",
            true,
            "The Visitor Center is open Saturday from 10 AM to 4 PM, and trails are open daily.",
            "web-visit",
          ),
        )
        .mockResolvedValueOnce(
          interaction(
            "answered",
            true,
            "Geiger Trail is a 0.4-mile paved option. The moderate Bridge Loop is 2.91 miles.",
            "trail-guide",
          ),
        ),
    };
    const result = await askGroundedQuestion(
      client,
      { message: CHAT_UI_COPY.en.quickActions[1].question, language: "en", history: [] },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [visitSource, trailSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("Geiger Trail");
    expect(result.sources[0]?.id).toBe("trail-guide");
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it("keeps a Spanish hours-and-admission answer when both dedicated sources support it", async () => {
    const hoursSource: SourceManifestEntry = {
      id: "visitor-hours",
      fileName: "official_reference__visitor-hours.md",
      documentPath: "knowledge/generated/prepared/official_reference__visitor-hours.md",
      title: "Elachee Visitor Center and Chicopee Woods Trail Hours",
      url: "https://elachee.org/hours",
      sourceType: "official_reference",
      priority: 90,
    };
    const admissionSource: SourceManifestEntry = {
      id: "admission-and-parking",
      fileName: "official_reference__admission-and-parking.md",
      documentPath: "knowledge/generated/prepared/official_reference__admission-and-parking.md",
      title: "Elachee Admission, Trail Access, and Parking Fees",
      url: "https://elachee.org/parking-admissions",
      sourceType: "official_reference",
      priority: 90,
    };
    const answer = "El Centro de Visitantes abre de miércoles a viernes y los sábados; los senderos abren todos los días hasta la puesta del sol. La admisión cuesta $10 por persona y el estacionamiento cuesta $5 por vehículo; el acceso a los senderos es gratis.";
    const client = {
      create: vi.fn().mockResolvedValue(
        interaction("answered", true, answer, ["visitor-hours", "admission-and-parking"]),
      ),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: CHAT_UI_COPY.es.quickActions[5].question,
        history: [],
        language: "es",
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [hoursSource, admissionSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("puesta del sol");
    expect(result.sources).toHaveLength(2);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it("retries a Spanish preset when the cited answer is in English", async () => {
    const trailSource: SourceManifestEntry = {
      id: "trail-guide",
      fileName: "official_reference__trail-guide.md",
      documentPath: "knowledge/generated/prepared/official_reference__trail-guide.md",
      title: "Chicopee Woods Hiking Trail Guide",
      url: "https://elachee.org/visit/hiking-trails",
      sourceType: "official_reference",
      priority: 90,
    };
    const client = {
      create: vi
        .fn()
        .mockResolvedValueOnce(
          interaction(
            "answered",
            true,
            "Geiger Trail is a 0.4-mile paved option. The Bridge Loop is 2.91 miles.",
            "trail-guide",
          ),
        )
        .mockResolvedValueOnce(
          interaction(
            "answered",
            true,
            "El sendero Geiger mide 0.4 millas y está pavimentado; Bridge Loop mide 2.91 millas.",
            "trail-guide",
          ),
        ),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: CHAT_UI_COPY.es.quickActions[1].question,
        language: "es",
        history: [],
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [trailSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("El sendero Geiger");
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(client.create.mock.calls[1]?.[0].input[0]?.content[0]?.text).toContain(
      "Provide the complete answer in Spanish",
    );
  });

  it("gives the events preset a current-calendar answer when searches cannot confirm a date", async () => {
    const eventsSource: SourceManifestEntry = {
      id: "events-guide",
      fileName: "official_reference__events-guide.md",
      documentPath: "knowledge/generated/prepared/official_reference__events-guide.md",
      title: "Finding Current Elachee Events and Programs",
      url: "https://elachee.org/events-parties",
      sourceType: "official_reference",
      priority: 90,
    };
    const client = {
      create: vi.fn().mockResolvedValue(interaction("not_found")),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: CHAT_UI_COPY.es.quickActions[4].question,
        history: [],
        language: "es",
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [eventsSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).toContain("No puedo confirmar una fecha específica");
    expect(result.sources[0]?.url).toBe("https://elachee.org/events-parties");
    expect(result.contactRecommended).toBe(false);
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it("does not repeat unsupported historical claims in an upcoming-events answer", async () => {
    const eventsSource: SourceManifestEntry = {
      id: "events-guide",
      fileName: "official_reference__events-guide.md",
      documentPath: "knowledge/generated/prepared/official_reference__events-guide.md",
      title: "Finding Current Elachee Events and Programs",
      url: "https://elachee.org/events-parties",
      sourceType: "official_reference",
      priority: 90,
    };
    const unsupportedAnswer = "No confirmed upcoming events are scheduled; the program dates concluded in early 20th-century months or spring 2026.";
    const client = {
      create: vi.fn().mockResolvedValue(
        interaction("answered", true, unsupportedAnswer, "events-guide"),
      ),
    };
    const result = await askGroundedQuestion(
      client,
      {
        message: CHAT_UI_COPY.en.quickActions[4].question,
        language: "en",
        history: [],
      },
      {
        model: "gemini-3.5-flash-lite",
        fileSearchStore: "fileSearchStores/test",
        manifest: [eventsSource],
      },
    );

    expect(result.status).toBe("answered");
    expect(result.answer).not.toContain("20th-century");
    expect(result.answer).toContain("couldn't confirm a specific upcoming event date");
    expect(result.sources[0]?.id).toBe("events-guide");
    expect(client.create).toHaveBeenCalledTimes(2);
  });
});
