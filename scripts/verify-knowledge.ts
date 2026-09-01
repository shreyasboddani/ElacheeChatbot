import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isApprovedWebsiteUrl } from "../src/lib/security/source-url";
import type {
  FaqEntry,
  OfficialDocumentSource,
  SourceManifestEntry,
  WebsiteSource,
} from "../src/lib/knowledge/types";
import {
  crawlHealthSnapshot,
  parseApprovedRemovalUrls,
} from "./crawl-website";

const MINIMUM_WEBSITE_PAGES = 50;
const MAXIMUM_WEBSITE_PAGES = 150;
const MAXIMUM_FAILURE_RATIO = 0.25;
const MAXIMUM_MARKDOWN_DOCUMENT_BYTES = 512 * 1_024;
const MAXIMUM_PDF_DOCUMENT_BYTES = 2 * 1_024 * 1_024;
const MAXIMUM_CORPUS_BYTES = 25 * 1_024 * 1_024;

interface CrawlReport {
  maxPages?: unknown;
  totalIndexed?: unknown;
  indexedPages?: unknown;
  failedPages?: unknown;
  duplicatePages?: unknown;
  blockedPages?: unknown;
  retainedPages?: unknown;
  approvedRemovedPages?: unknown;
}

interface CrawlFailure {
  url: string;
  reason: string;
}

interface DuplicatePage {
  url: string;
  duplicateOf: string;
}

export interface KnowledgeVerificationSummary {
  websiteDocuments: number;
  officialDocumentDocuments: number;
  managerFaqDocuments: number;
  pendingFaqDocuments: number;
  totalDocuments: number;
  totalBytes: number;
  crawlFailures: number;
  retainedWebsiteDocuments: number;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isManifestEntry(value: unknown): value is SourceManifestEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.fileName === "string" &&
    typeof entry.documentPath === "string" &&
    typeof entry.title === "string" &&
    (entry.sourceType === "official_website" ||
      entry.sourceType === "official_document" ||
      entry.sourceType === "manager_faq") &&
    typeof entry.priority === "number" &&
    (entry.contentHash === undefined || typeof entry.contentHash === "string")
  );
}

function isOfficialDocumentSource(
  value: unknown,
): value is OfficialDocumentSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    typeof source.title === "string" &&
    typeof source.url === "string" &&
    typeof source.sourcePath === "string" &&
    typeof source.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(source.contentHash) &&
    source.sourceType === "official_document"
  );
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveOfficialDocumentPath(
  root: string,
  sourcePath: string,
): string | undefined {
  const sourceRoot = path.resolve(root, "knowledge/source/official-documents");
  const resolved = path.resolve(root, sourcePath);
  const relative = path.relative(sourceRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

function isFaqEntry(value: unknown): value is FaqEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.question === "string" &&
    typeof entry.answer === "string" &&
    ["approved", "pending", "conflicting", "needs_review"].includes(
      String(entry.status),
    ) &&
    Array.isArray(entry.contacts) &&
    entry.contacts.every((contact) => typeof contact === "string") &&
    Array.isArray(entry.relatedUrls) &&
    entry.relatedUrls.every((url) => typeof url === "string") &&
    Array.isArray(entry.notes) &&
    entry.notes.every((note) => typeof note === "string") &&
    entry.sourceType === "manager_faq"
  );
}

function isWebsiteSource(value: unknown): value is WebsiteSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    typeof source.title === "string" &&
    typeof source.canonicalUrl === "string" &&
    typeof source.fetchedAt === "string" &&
    typeof source.text === "string" &&
    Array.isArray(source.headings) &&
    source.headings.every((heading) => typeof heading === "string") &&
    Array.isArray(source.links) &&
    source.links.every(
      (link) =>
        Boolean(link) &&
        typeof link === "object" &&
        typeof (link as Record<string, unknown>).label === "string" &&
        typeof (link as Record<string, unknown>).url === "string",
    ) &&
    source.sourceType === "official_website"
  );
}

function isCrawlFailure(value: unknown): value is CrawlFailure {
  if (!value || typeof value !== "object") return false;
  const failure = value as Record<string, unknown>;
  return typeof failure.url === "string" && typeof failure.reason === "string";
}

function isDuplicatePage(value: unknown): value is DuplicatePage {
  if (!value || typeof value !== "object") return false;
  const duplicate = value as Record<string, unknown>;
  return (
    typeof duplicate.url === "string" &&
    typeof duplicate.duplicateOf === "string"
  );
}

function isIndexedPage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.id === "string" &&
    typeof page.title === "string" &&
    typeof page.url === "string" &&
    typeof page.fetchedAt === "string"
  );
}

export function containsKnowledgePromptInjection(value: string): boolean {
  return (
    /\b(?:ignore|disregard|override)\b[\s\S]{0,80}\b(?:previous|prior|system|developer|instruction|rule)s?\b/i.test(
      value,
    ) ||
    /\b(?:reveal|print|expose|repeat)\b[\s\S]{0,80}\b(?:system prompt|developer message|api key|hidden instruction|secret)\b/i.test(
      value,
    ) ||
    /\byou are now\b[\s\S]{0,80}\b(?:assistant|chatbot|model)\b/i.test(
      value,
    )
  );
}

export function resolvePreparedDocumentPath(
  root: string,
  documentPath: string,
): string | undefined {
  const preparedRoot = path.resolve(root, "knowledge/generated/prepared");
  const resolved = path.resolve(root, documentPath);
  const relative = path.relative(preparedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export async function verifyKnowledgeSnapshot(
  root = process.cwd(),
): Promise<KnowledgeVerificationSummary> {
  const generatedDir = path.resolve(root, "knowledge/generated");
  const [
    sourceValue,
    runtimeValue,
    crawlValue,
    faqValue,
    reportValue,
    crawlHealthValue,
    approvedRemovalValue,
    officialDocumentValue,
  ] =
    await Promise.all([
      readJson(path.join(generatedDir, "sources.json")),
      readJson(path.resolve(root, "src/generated/knowledge-manifest.json")),
      readJson(path.join(generatedDir, "crawl-data.json")),
      readJson(path.join(generatedDir, "manager-faq.json")),
      readJson(path.join(generatedDir, "crawl-report.json")),
      readJson(path.join(generatedDir, "crawl-health.json")),
      readJson(path.resolve(root, "knowledge/source/approved-removals.json")),
      readJson(path.resolve(root, "knowledge/source/official-documents.json")),
    ]);

  const errors: string[] = [];
  if (!Array.isArray(sourceValue) || !sourceValue.every(isManifestEntry)) {
    throw new Error("knowledge/generated/sources.json is not a valid manifest.");
  }
  if (!Array.isArray(runtimeValue) || !runtimeValue.every(isManifestEntry)) {
    throw new Error("src/generated/knowledge-manifest.json is not valid.");
  }
  if (JSON.stringify(sourceValue) !== JSON.stringify(runtimeValue)) {
    errors.push("The upload and runtime manifests do not match exactly.");
  }
  if (!Array.isArray(crawlValue) || !crawlValue.every(isWebsiteSource)) {
    throw new Error("knowledge/generated/crawl-data.json is not valid.");
  }
  if (!Array.isArray(faqValue) || !faqValue.every(isFaqEntry)) {
    throw new Error("knowledge/generated/manager-faq.json is not valid.");
  }
  if (
    !officialDocumentValue ||
    typeof officialDocumentValue !== "object" ||
    !Array.isArray(
      (officialDocumentValue as Record<string, unknown>).documents,
    ) ||
    !(officialDocumentValue as { documents: unknown[] }).documents.every(
      isOfficialDocumentSource,
    )
  ) {
    throw new Error("knowledge/source/official-documents.json is not valid.");
  }

  const sources = sourceValue;
  const websiteSources = crawlValue;
  const faqEntries = faqValue;
  const officialDocuments = (
    officialDocumentValue as { documents: OfficialDocumentSource[] }
  ).documents;
  const report =
    reportValue && typeof reportValue === "object"
      ? (reportValue as CrawlReport)
      : {};
  const failedPages = Array.isArray(report.failedPages)
    ? report.failedPages.filter(isCrawlFailure)
    : [];
  const duplicatePages = Array.isArray(report.duplicatePages)
    ? report.duplicatePages.filter(isDuplicatePage)
    : [];
  const blockedPages = Array.isArray(report.blockedPages)
    ? report.blockedPages.filter(
        (blockedPage): blockedPage is string => typeof blockedPage === "string",
      )
    : [];
  const retainedPages = Array.isArray(report.retainedPages)
    ? report.retainedPages.filter(isCrawlFailure)
    : [];
  const approvedRemovedPages = Array.isArray(report.approvedRemovedPages)
    ? report.approvedRemovedPages.filter(
        (removedPage): removedPage is string => typeof removedPage === "string",
      )
    : [];
  let approvedRemovalUrls = new Set<string>();
  try {
    approvedRemovalUrls = parseApprovedRemovalUrls(approvedRemovalValue);
  } catch (error: unknown) {
    errors.push(
      error instanceof Error
        ? error.message
        : "approved-removals.json is invalid.",
    );
  }
  const reportShapeIsValid =
    Number.isInteger(report.maxPages) &&
    typeof report.maxPages === "number" &&
    report.maxPages >= 1 &&
    report.maxPages <= MAXIMUM_WEBSITE_PAGES &&
    Number.isInteger(report.totalIndexed) &&
    typeof report.totalIndexed === "number" &&
    Array.isArray(report.indexedPages) &&
    report.indexedPages.every(isIndexedPage) &&
    Array.isArray(report.failedPages) &&
    failedPages.length === report.failedPages.length &&
    Array.isArray(report.duplicatePages) &&
    duplicatePages.length === report.duplicatePages.length &&
    Array.isArray(report.blockedPages) &&
    blockedPages.length === report.blockedPages.length &&
    Array.isArray(report.retainedPages) &&
    retainedPages.length === report.retainedPages.length &&
    Array.isArray(report.approvedRemovedPages) &&
    approvedRemovedPages.length === report.approvedRemovedPages.length;
  if (!reportShapeIsValid) {
    errors.push("crawl-report.json has invalid or incomplete health fields.");
  }
  if (
    JSON.stringify(crawlHealthValue) !==
    JSON.stringify(
      crawlHealthSnapshot({
        maxPages: typeof report.maxPages === "number" ? report.maxPages : 0,
        totalIndexed:
          typeof report.totalIndexed === "number" ? report.totalIndexed : 0,
        failedPages,
        duplicatePages,
        blockedPages,
        retainedPages,
        approvedRemovedPages,
      }),
    )
  ) {
    errors.push("crawl-health.json does not match the latest crawl report.");
  }
  const websiteManifest = sources.filter(
    (source) => source.sourceType === "official_website",
  );
  const officialDocumentManifest = sources.filter(
    (source) => source.sourceType === "official_document",
  );
  const faqManifest = sources.filter(
    (source) => source.sourceType === "manager_faq",
  );
  const approvedFaq = faqEntries.filter((entry) => entry.status === "approved");
  const pendingFaq = faqEntries.filter((entry) => entry.status !== "approved");

  if (
    websiteSources.length < MINIMUM_WEBSITE_PAGES ||
    websiteSources.length > MAXIMUM_WEBSITE_PAGES
  ) {
    errors.push(
      `Website page count ${websiteSources.length} is outside the safe ${MINIMUM_WEBSITE_PAGES}-${MAXIMUM_WEBSITE_PAGES} range.`,
    );
  }
  if (websiteManifest.length !== websiteSources.length) {
    errors.push("The website manifest count does not match the crawl data.");
  }
  if (officialDocumentManifest.length !== officialDocuments.length) {
    errors.push(
      "The official-document manifest count does not match the source registry.",
    );
  }
  if (faqManifest.length !== approvedFaq.length) {
    errors.push("The manager FAQ manifest count does not match approved entries.");
  }
  const approvedFaqIds = new Set(approvedFaq.map((entry) => entry.id));
  const pendingFaqIds = new Set(pendingFaq.map((entry) => entry.id));
  for (const source of faqManifest) {
    if (!approvedFaqIds.has(source.id)) {
      errors.push(`Manager FAQ ${source.id} is not approved.`);
    }
    if (pendingFaqIds.has(source.id)) {
      errors.push(`Pending manager FAQ ${source.id} entered the prepared corpus.`);
    }
    if (source.url) {
      errors.push(`Manager FAQ ${source.id} must not have a fabricated URL.`);
    }
  }
  for (const entry of faqEntries) {
    for (const relatedUrl of entry.relatedUrls) {
      if (!isApprovedWebsiteUrl(relatedUrl)) {
        errors.push(`Manager FAQ ${entry.id} contains an unapproved related URL.`);
      }
    }
  }

  const crawledById = new Map(
    websiteSources.map((source) => [source.id, source]),
  );
  for (const websiteSource of websiteSources) {
    if (approvedRemovalUrls.has(websiteSource.canonicalUrl)) {
      errors.push(
        `Approved removal ${websiteSource.canonicalUrl} remained in the crawl.`,
      );
    }
    if (!isApprovedWebsiteUrl(websiteSource.canonicalUrl)) {
      errors.push(`Crawled source ${websiteSource.id} has an unapproved URL.`);
    }
    for (const link of websiteSource.links) {
      if (!isApprovedWebsiteUrl(link.url)) {
        errors.push(`Crawled source ${websiteSource.id} has an unapproved link.`);
      }
    }
  }

  const officialDocumentsById = new Map(
    officialDocuments.map((source) => [source.id, source]),
  );
  for (const source of officialDocuments) {
    if (!isApprovedWebsiteUrl(source.url)) {
      errors.push(`Official document ${source.id} has an unapproved URL.`);
    }
    const sourcePath = resolveOfficialDocumentPath(root, source.sourcePath);
    if (!sourcePath || path.extname(sourcePath).toLowerCase() !== ".pdf") {
      errors.push(`Official document ${source.id} has an unsafe source path.`);
      continue;
    }
    try {
      const content = await readFile(/* turbopackIgnore: true */ sourcePath);
      if (!content.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        errors.push(`Official document ${source.id} is not a valid PDF.`);
      }
      if (sha256(content) !== source.contentHash) {
        errors.push(`Official document ${source.id} failed its source hash check.`);
      }
    } catch {
      errors.push(`Official document ${source.id} is missing its source PDF.`);
    }
  }

  const crawledUrls = new Set(
    websiteSources.map((source) => source.canonicalUrl),
  );
  for (const retainedPage of retainedPages) {
    if (!crawledUrls.has(retainedPage.url)) {
      errors.push(`Retained page ${retainedPage.url} is missing from crawl data.`);
    }
    if (!isApprovedWebsiteUrl(retainedPage.url)) {
      errors.push(`Retained page ${retainedPage.url} is not an approved website URL.`);
    }
  }
  for (const removedPage of approvedRemovedPages) {
    if (!approvedRemovalUrls.has(removedPage)) {
      errors.push(`Crawl report contains an unapproved removal: ${removedPage}`);
    }
    if (crawledUrls.has(removedPage)) {
      errors.push(`Approved removal ${removedPage} is still indexed.`);
    }
  }

  const duplicateIds = duplicateValues(sources.map((source) => source.id));
  const duplicateFiles = duplicateValues(sources.map((source) => source.fileName));
  const duplicateUrls = duplicateValues(
    [...websiteManifest, ...officialDocumentManifest].flatMap((source) =>
      source.url ? [source.url] : [],
    ),
  );
  if (duplicateIds.length > 0) errors.push("The manifest contains duplicate source IDs.");
  if (duplicateFiles.length > 0) errors.push("The manifest contains duplicate file names.");
  if (duplicateUrls.length > 0) errors.push("The manifest contains duplicate official URLs.");

  const crawlFailures = failedPages.length;
  const crawlTotal = websiteSources.length + crawlFailures;
  if (
    crawlTotal > 0 &&
    crawlFailures / crawlTotal > MAXIMUM_FAILURE_RATIO
  ) {
    errors.push("The crawl failure ratio exceeds the 25% safety threshold.");
  }
  if (report.totalIndexed !== websiteSources.length) {
    errors.push("crawl-report.json totalIndexed does not match crawl-data.json.");
  }
  if (
    !Array.isArray(report.indexedPages) ||
    report.indexedPages.length !== websiteSources.length
  ) {
    errors.push("crawl-report.json indexedPages does not match crawl-data.json.");
  }

  const manifestFileNames = new Set(sources.map((source) => source.fileName));
  const preparedFiles = (
    await readdir(path.join(generatedDir, "prepared"), {
      withFileTypes: true,
    })
  )
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".pdf")),
    )
    .map((entry) => entry.name);
  const unexpectedFiles = preparedFiles.filter(
    (fileName) => !manifestFileNames.has(fileName),
  );
  if (unexpectedFiles.length > 0) {
    errors.push("The prepared directory contains unmapped documents.");
  }
  if (preparedFiles.length !== sources.length) {
    errors.push("The prepared document count does not match the manifest.");
  }

  let totalBytes = 0;
  for (const source of sources) {
    if (!/^[a-z0-9][a-z0-9-]{1,120}$/.test(source.id)) {
      errors.push(`Source ${source.id} has an unsafe source ID.`);
    }
    const expectedFileName =
      source.sourceType === "official_website"
        ? `website__${source.id}.md`
        : source.sourceType === "official_document"
          ? `official_document__${source.id}.pdf`
          : `manager_faq__${source.id}.md`;
    const expectedDocumentPath = `knowledge/generated/prepared/${expectedFileName}`;
    if (
      source.fileName !== expectedFileName ||
      source.documentPath !== expectedDocumentPath
    ) {
      errors.push(`Source ${source.id} does not use its expected generated path.`);
    }
    const resolvedPath = resolvePreparedDocumentPath(root, source.documentPath);
    if (!resolvedPath || path.basename(resolvedPath) !== source.fileName) {
      errors.push(`Source ${source.id} has an unsafe document path.`);
      continue;
    }
    if (source.sourceType === "official_website") {
      if (!source.url || !isApprovedWebsiteUrl(source.url)) {
        errors.push(`Website source ${source.id} has an unapproved URL.`);
      }
      const crawled = crawledById.get(source.id);
      if (!crawled || crawled.canonicalUrl !== source.url) {
        errors.push(`Website source ${source.id} does not match crawl data.`);
      }
      if (source.priority !== 50) {
        errors.push(`Website source ${source.id} has an unexpected priority.`);
      }
    } else if (source.sourceType === "official_document") {
      const configured = officialDocumentsById.get(source.id);
      if (
        !configured ||
        configured.title !== source.title ||
        configured.url !== source.url ||
        configured.contentHash !== source.contentHash
      ) {
        errors.push(
          `Official document ${source.id} does not match the source registry.`,
        );
      }
      if (!source.url || !isApprovedWebsiteUrl(source.url)) {
        errors.push(`Official document ${source.id} has an unapproved URL.`);
      }
      if (source.priority !== 75) {
        errors.push(`Official document ${source.id} has an unexpected priority.`);
      }
    } else if (source.priority !== 100) {
      errors.push(`Manager FAQ ${source.id} has an unexpected priority.`);
    }
    try {
      const fileStat = await stat(/* turbopackIgnore: true */ resolvedPath);
      totalBytes += fileStat.size;
      const maximumDocumentBytes =
        source.sourceType === "official_document"
          ? MAXIMUM_PDF_DOCUMENT_BYTES
          : MAXIMUM_MARKDOWN_DOCUMENT_BYTES;
      if (fileStat.size > maximumDocumentBytes) {
        errors.push(`Source ${source.id} exceeds the per-document size limit.`);
      }
      const content = await readFile(/* turbopackIgnore: true */ resolvedPath);
      if (source.sourceType === "official_document") {
        if (!content.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
          errors.push(`Official document ${source.id} is not a valid prepared PDF.`);
        }
        if (!source.contentHash || sha256(content) !== source.contentHash) {
          errors.push(`Official document ${source.id} failed its prepared hash check.`);
        }
      } else {
        const markdown = content.toString("utf8");
        if (!markdown.includes(`Source ID: ${source.id}`)) {
          errors.push(`Source ${source.id} is missing its matching source marker.`);
        }
        if (containsKnowledgePromptInjection(markdown)) {
          errors.push(`Source ${source.id} contains instruction-like content.`);
        }
      }
    } catch {
      errors.push(`Source ${source.id} is missing its prepared document.`);
    }
  }
  if (totalBytes > MAXIMUM_CORPUS_BYTES) {
    errors.push("The prepared corpus exceeds the total size safety limit.");
  }

  if (errors.length > 0) {
    throw new Error(`Knowledge verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    websiteDocuments: websiteManifest.length,
    officialDocumentDocuments: officialDocumentManifest.length,
    managerFaqDocuments: faqManifest.length,
    pendingFaqDocuments: pendingFaq.length,
    totalDocuments: sources.length,
    totalBytes,
    crawlFailures,
    retainedWebsiteDocuments: retainedPages.length,
  };
}

async function main() {
  const summary = await verifyKnowledgeSnapshot();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown verification error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
