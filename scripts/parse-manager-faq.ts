import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";
import mammoth from "mammoth";

import { canonicalizeElacheeUrl } from "../src/lib/config";
import type { FaqEntry, FaqStatus } from "../src/lib/knowledge/types";

interface ParagraphRecord {
  text: string;
  links: string[];
}

interface FaqBlueprint {
  id: string;
  question: string;
  match: string;
  status?: FaqStatus;
  inlineAnswer?: (rawText: string) => string | undefined;
}

const FAQ_BLUEPRINTS: FaqBlueprint[] = [
  { id: "visitor-hours", question: "What are the visitor center hours?", match: "what are the visitor center hours" },
  { id: "admission-prices", question: "How much is admission?", match: "how much is admission" },
  { id: "trail-hours", question: "When are the trails open?", match: "when are the trails open" },
  { id: "trail-access", question: "Which trails are stroller friendly?", match: "which trails are stroller friendly" },
  { id: "camp-elachee", question: "What is Camp Elachee?", match: "what is camp elachee" },
  { id: "nature-academy", question: "What is Nature Academy?", match: "what is nature academy" },
  { id: "sprouts", question: "What is Sprouts?", match: "what is sprouts" },
  { id: "homeschool-programs", question: "What homeschool programs are available?", match: "what homeschool programs are available" },
  { id: "field-trips", question: "How do I plan a field trip?", match: "how do i plan a field trip" },
  { id: "volunteer", question: "How can I volunteer?", match: "how can i volunteer" },
  { id: "upcoming-events", question: "What upcoming events are available?", match: "what upcoming events are available" },
  { id: "membership", question: "What does membership include?", match: "what does membership include" },
];

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function paragraphsFromMammothHtml(html: string): ParagraphRecord[] {
  const $ = load(html, null, false);
  return $("p, li")
    .toArray()
    .map((element) => {
      const ownContent = $(element).clone();
      ownContent.find("ul, ol").remove();
      return {
        text: ownContent.text().replace(/\s+/g, " ").trim(),
        links: ownContent
        .find("a[href]")
        .toArray()
        .map((anchor) => $(anchor).attr("href")?.trim())
        .filter((href): href is string => Boolean(href)),
      };
    })
    .filter((paragraph) => paragraph.text.length > 0);
}

function findBlueprintIndex(text: string): number {
  const candidate = normalize(text);
  return FAQ_BLUEPRINTS.findIndex((blueprint) =>
    candidate.startsWith(normalize(blueprint.match)),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function contactsFrom(records: ParagraphRecord[]): string[] {
  const values: string[] = [];
  for (const record of records) {
    for (const link of record.links) {
      if (link.toLowerCase().startsWith("mailto:")) {
        values.push(link.slice("mailto:".length).toLowerCase());
      }
    }
    values.push(
      ...(record.text.match(/[A-Z0-9._%+-]+@elachee\.org/gi) ?? []).map(
        (email) => email.toLowerCase(),
      ),
    );
  }
  return unique(values);
}

function urlsFrom(records: ParagraphRecord[]): string[] {
  return unique(
    records.flatMap((record) =>
      record.links
        .map(canonicalizeElacheeUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

export function parseFaqParagraphs(paragraphs: ParagraphRecord[]): FaqEntry[] {
  const boundaryByParagraph = new Map<number, number>();
  paragraphs.forEach((paragraph, index) => {
    const blueprintIndex = findBlueprintIndex(paragraph.text);
    if (blueprintIndex >= 0) boundaryByParagraph.set(index, blueprintIndex);
  });

  const entries: FaqEntry[] = [];
  const usedBlueprints = new Set<number>();
  const boundaries = [...boundaryByParagraph.keys()].sort((a, b) => a - b);
  for (let position = 0; position < boundaries.length; position += 1) {
    const paragraphIndex = boundaries[position];
    const blueprintIndex = boundaryByParagraph.get(paragraphIndex);
    if (blueprintIndex === undefined || usedBlueprints.has(blueprintIndex)) continue;
    usedBlueprints.add(blueprintIndex);

    const blueprint = FAQ_BLUEPRINTS[blueprintIndex];
    const nextBoundary = boundaries[position + 1] ?? paragraphs.length;
    const questionRecord = paragraphs[paragraphIndex];
    const answerRecords = paragraphs.slice(paragraphIndex + 1, nextBoundary);
    const inlineAnswer = blueprint.inlineAnswer?.(questionRecord.text);
    const answerParts = [inlineAnswer, ...answerRecords.map((item) => item.text)].filter(
      (value): value is string => Boolean(value && value.trim()),
    );
    const allRecords = [questionRecord, ...answerRecords];
    const requestedStatus = blueprint.status;
    const status: FaqStatus = requestedStatus
      ? requestedStatus
      : answerParts.length > 0
        ? "approved"
        : "needs_review";

    entries.push({
      id: blueprint.id,
      question: blueprint.question,
      answer: status === "approved" ? answerParts.join("\n") : "",
      status,
      contacts: contactsFrom(allRecords),
      relatedUrls: urlsFrom(allRecords),
      notes:
        status === "approved"
          ? []
          : ["No complete staff-approved answer was provided in the source document."],
      sourceType: "manager_faq",
    });
  }

  for (let index = 0; index < FAQ_BLUEPRINTS.length; index += 1) {
    if (usedBlueprints.has(index)) continue;
    const blueprint = FAQ_BLUEPRINTS[index];
    entries.push({
      id: blueprint.id,
      question: blueprint.question,
      answer: "",
      status: blueprint.status ?? "needs_review",
      contacts: [],
      relatedUrls: [],
      notes: ["The expected question could not be located in the source document."],
      sourceType: "manager_faq",
    });
  }

  return entries;
}

export async function readManagerFaqDocument(docxPath: string): Promise<FaqEntry[]> {
  const result = await mammoth.convertToHtml({ path: docxPath });
  return parseFaqParagraphs(paragraphsFromMammothHtml(result.value));
}

function entryMarkdown(entry: FaqEntry): string {
  const lines = [`## ${entry.question}`, "", `Status: ${entry.status}`];
  if (entry.answer) lines.push("", entry.answer);
  if (entry.contacts.length > 0) {
    lines.push("", `Verified contacts: ${entry.contacts.join(", ")}`);
  }
  if (entry.relatedUrls.length > 0) {
    lines.push("", "Related official pages:", ...entry.relatedUrls.map((url) => `- ${url}`));
  }
  if (entry.notes.length > 0) lines.push("", ...entry.notes.map((note) => `Note: ${note}`));
  return lines.join("\n");
}

export async function writeFaqOutputs(entries: FaqEntry[], outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  const approved = entries.filter((entry) => entry.status === "approved");
  const unresolved = entries.filter((entry) => entry.status !== "approved");
  const header = "# Elachee manager-provided FAQ\n\nGenerated from the staff-provided DOCX.\n";

  await Promise.all([
    writeFile(
      path.join(outputDir, "manager-faq.json"),
      `${JSON.stringify(entries, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-approved.md"),
      `${header}\n${approved.map(entryMarkdown).join("\n\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-pending.md"),
      `${header}\n${unresolved.map(entryMarkdown).join("\n\n")}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, "manager-faq-report.json"),
      `${JSON.stringify(
        {
          parsedAt: new Date().toISOString(),
          totalEntries: entries.length,
          approvedEntries: approved.map((entry) => entry.id),
          pendingEntries: unresolved.map((entry) => ({
            id: entry.id,
            question: entry.question,
            status: entry.status,
            notes: entry.notes,
          })),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);
}

async function main() {
  const root = process.cwd();
  const docxPath = path.resolve(
    root,
    process.argv[2] || "knowledge/source/elachee-questions.docx",
  );
  const outputDir = path.resolve(root, "knowledge/generated");
  let entries: FaqEntry[];
  try {
    entries = await readManagerFaqDocument(docxPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      entries = [];
      process.stdout.write(
        `No optional staff FAQ DOCX found at ${docxPath}; writing an empty Elachee FAQ set.\n`,
      );
    } else {
      throw error;
    }
  }
  await writeFaqOutputs(entries, outputDir);

  const approved = entries.filter((entry) => entry.status === "approved").length;
  const unresolved = entries.length - approved;
  process.stdout.write(
    `Parsed ${entries.length} FAQ entries: ${approved} approved, ${unresolved} pending or needing review.\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown FAQ parsing error";
    process.stderr.write(`FAQ parsing failed: ${message}\n`);
    process.exitCode = 1;
  });
}
