import type { KnowledgeConflictTopic, WebsiteSource } from "./types";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_PATTERN = "Sun(?:day)?|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?";
const DAY_TOKEN = new RegExp(`\\b(${DAY_PATTERN})\\b`, "gi");
const DAY_RANGE = new RegExp(
  `\\b(${DAY_PATTERN})\\s*(?:-|–|—|to|through)\\s*(${DAY_PATTERN})\\b`,
  "gi",
);

function dayIndex(value: string): number | undefined {
  const day = value.slice(0, 3).toLowerCase();
  const index = DAYS.indexOf(day as (typeof DAYS)[number]);
  return index === -1 ? undefined : index;
}

function listedDays(line: string): Set<number> {
  const days = new Set<number>();
  let remaining = line;

  for (const match of line.matchAll(DAY_RANGE)) {
    const start = dayIndex(match[1] ?? "");
    const end = dayIndex(match[2] ?? "");
    if (start === undefined || end === undefined) continue;
    for (let day = start, count = 0; count < DAYS.length; day = (day + 1) % DAYS.length, count += 1) {
      days.add(day);
      if (day === end) break;
    }
    remaining = remaining.replace(match[0], " ");
  }

  if (/\bdaily\b|\bevery day\b/i.test(line)) {
    return new Set(DAYS.map((_, index) => index));
  }
  for (const match of remaining.matchAll(DAY_TOKEN)) {
    const index = dayIndex(match[1] ?? "");
    if (index !== undefined) days.add(index);
  }
  return days;
}

function visitorHoursBlock(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*hours\s*$/i.test(line));
  if (start === -1) return undefined;
  const section: string[] = [];
  for (const line of lines.slice(start + 1, start + 18)) {
    if (/^\s*(?:admission|what to bring|rules|parking fees)\s*$/i.test(line)) break;
    section.push(line);
  }
  return section.join("\n");
}

export function hasConflictingVisitorCenterHours(
  source: Pick<WebsiteSource, "canonicalUrl" | "text">,
): boolean {
  let pathname: string;
  try {
    pathname = new URL(source.canonicalUrl).pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
  if (pathname !== "/visit") return false;

  const section = visitorHoursBlock(source.text);
  if (!section) return false;
  const openDays = new Set<number>();
  const closedDays = new Set<number>();

  for (const line of section.split(/\r?\n/)) {
    const days = listedDays(line);
    if (/\bclosed\b/i.test(line)) {
      for (const day of days) closedDays.add(day);
    } else if (/\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|sunset)\b/i.test(line)) {
      for (const day of days) openDays.add(day);
    }
  }

  return [...openDays].some((day) => closedDays.has(day));
}

export function conflictingTopicsForWebsiteSource(
  source: WebsiteSource,
): KnowledgeConflictTopic[] {
  return hasConflictingVisitorCenterHours(source)
    ? ["visitor_center_hours"]
    : [];
}
