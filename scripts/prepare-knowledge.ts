import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  FaqEntry,
  OfficialDocumentSource,
  PublicReferenceSource,
  SourceManifestEntry,
  WebsiteSource,
} from "../src/lib/knowledge/types";
import { conflictingTopicsForWebsiteSource } from "../src/lib/knowledge/schedule-conflicts";
import { isApprovedWebsiteUrl } from "../src/lib/security/source-url";

async function readJsonIfPresent(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
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
    Array.isArray(entry.relatedUrls) &&
    Array.isArray(entry.notes) &&
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
    Array.isArray(source.links) &&
    source.sourceType === "official_website"
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

function isPublicReferenceSource(
  value: unknown,
): value is PublicReferenceSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    /^[a-z0-9][a-z0-9-]{1,120}$/.test(source.id) &&
    typeof source.title === "string" &&
    typeof source.url === "string" &&
    typeof source.sourcePath === "string" &&
    typeof source.verifiedOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(source.verifiedOn) &&
    Array.isArray(source.verifiedAgainst) &&
    source.verifiedAgainst.length > 0 &&
    source.verifiedAgainst.every((url) => typeof url === "string")
  );
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveOfficialDocumentPath(
  root: string,
  sourcePath: string,
): string | undefined {
  const documentRoot = path.resolve(root, "knowledge/source/official-documents");
  const resolved = path.resolve(root, sourcePath);
  const relative = path.relative(documentRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

function resolvePublicReferencePath(
  root: string,
  sourcePath: string,
): string | undefined {
  const referenceRoot = path.resolve(root, "knowledge/source/public-references");
  const resolved = path.resolve(root, sourcePath);
  const relative = path.relative(referenceRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

function websiteMarkdown(source: WebsiteSource): string {
  const headings = source.headings.map((heading) => `- ${heading}`).join("\n");
  const links = source.links
    .map((link) => `- ${link.label}: ${link.url}`)
    .join("\n");
  return [
    `# ${source.title}`,
    "",
    `Source ID: ${source.id}`,
    "Source type: official_website",
    `Canonical URL: ${source.canonicalUrl}`,
    ...(headings ? ["", "## Important headings", "", headings] : []),
    "",
    "## Approved page content",
    "",
    source.text,
    ...(links ? ["", "## Relevant official links", "", links] : []),
    "",
  ].join("\n");
}

function faqMarkdown(entry: FaqEntry): string {
  return [
    `# ${entry.question}`,
    "",
    `Source ID: ${entry.id}`,
    "Source type: manager_faq",
    "Approval status: approved",
    "",
    "## Staff-approved answer",
    "",
    entry.answer,
    ...(entry.contacts.length > 0
      ? ["", "## Verified staff contacts", "", ...entry.contacts.map((contact) => `- ${contact}`)]
      : []),
    ...(entry.relatedUrls.length > 0
      ? ["", "## Related official pages", "", ...entry.relatedUrls.map((url) => `- ${url}`)]
      : []),
    "",
  ].join("\n");
}

function publicReferenceMarkdown(
  source: PublicReferenceSource,
  content: string,
): string {
  return [
    `# ${source.title}`,
    "",
    `Source ID: ${source.id}`,
    "Source type: official_reference",
    `Canonical URL: ${source.url}`,
    `Verified against official Elachee pages on: ${source.verifiedOn}`,
    "",
    "## Official Elachee pages reviewed",
    "",
    ...source.verifiedAgainst.map((url) => `- ${url}`),
    "",
    "## Curated public facts",
    "",
    content.trim(),
    "",
  ].join("\n");
}

function potentialWebsiteMatches(
  pendingEntries: FaqEntry[],
  websiteSources: WebsiteSource[],
) {
  return pendingEntries.flatMap((entry) => {
    const keywords = [
      ...new Set(
        entry.question
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(
            (word) =>
              word.length > 4 &&
              !["what", "your", "there", "these", "store"].includes(word),
          ),
      ),
    ];
    const matches = websiteSources
      .filter((source) => {
        const haystack = `${source.title} ${source.text}`.toLowerCase();
        return keywords.length >= 2 && keywords.every((word) => haystack.includes(word));
      })
      .map((source) => ({ title: source.title, url: source.canonicalUrl }));
    return matches.length > 0
      ? [{ faqId: entry.id, question: entry.question, potentialMatches: matches }]
      : [];
  });
}

export async function prepareKnowledge(root = process.cwd()) {
  const generatedDir = path.resolve(root, "knowledge/generated");
  const preparedDir = path.join(generatedDir, "prepared");
  const srcGeneratedDir = path.resolve(root, "src/generated");
  const faqValue = await readJsonIfPresent(path.join(generatedDir, "manager-faq.json"));
  if (!Array.isArray(faqValue)) {
    throw new Error(
      "manager-faq.json is missing. Run npm run knowledge:parse-faq first.",
    );
  }
  const faqEntries = faqValue.filter(isFaqEntry);

  const crawlValue = await readJsonIfPresent(path.join(generatedDir, "crawl-data.json"));
  const websiteSources = Array.isArray(crawlValue)
    ? crawlValue.filter(isWebsiteSource)
    : [];
  const crawlReportValue = await readJsonIfPresent(
    path.join(generatedDir, "crawl-report.json"),
  );
  const crawlReport =
    crawlReportValue && typeof crawlReportValue === "object"
      ? (crawlReportValue as Record<string, unknown>)
      : {};
  const officialDocumentValue = await readJsonIfPresent(
    path.resolve(root, "knowledge/source/official-documents.json"),
  );
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
    throw new Error("official-documents.json is invalid.");
  }
  const officialDocuments = (
    officialDocumentValue as { documents: OfficialDocumentSource[] }
  ).documents;
  const officialDocumentFiles = await Promise.all(
    officialDocuments.map(async (source) => {
      if (!isApprovedWebsiteUrl(source.url)) {
        throw new Error(`Official document ${source.id} has an unapproved URL.`);
      }
      const absolutePath = resolveOfficialDocumentPath(root, source.sourcePath);
      if (!absolutePath || path.extname(absolutePath).toLowerCase() !== ".pdf") {
        throw new Error(`Official document ${source.id} has an unsafe source path.`);
      }
      const content = await readFile(absolutePath);
      if (!content.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        throw new Error(`Official document ${source.id} is not a valid PDF.`);
      }
      if (sha256(content) !== source.contentHash) {
        throw new Error(`Official document ${source.id} failed its hash check.`);
      }
      return { source, content };
    }),
  );
  const publicReferenceValue = await readJsonIfPresent(
    path.resolve(root, "knowledge/source/public-references.json"),
  );
  if (
    !publicReferenceValue ||
    typeof publicReferenceValue !== "object" ||
    !Array.isArray(
      (publicReferenceValue as Record<string, unknown>).documents,
    ) ||
    !(publicReferenceValue as { documents: unknown[] }).documents.every(
      isPublicReferenceSource,
    )
  ) {
    throw new Error("public-references.json is invalid.");
  }
  const publicReferenceSources = (
    publicReferenceValue as { documents: PublicReferenceSource[] }
  ).documents;
  const publicReferenceFiles = await Promise.all(
    publicReferenceSources.map(async (source) => {
      if (
        !isApprovedWebsiteUrl(source.url) ||
        source.verifiedAgainst.some((url) => !isApprovedWebsiteUrl(url))
      ) {
        throw new Error(`Public reference ${source.id} has an unapproved URL.`);
      }
      const absolutePath = resolvePublicReferencePath(root, source.sourcePath);
      if (!absolutePath || path.extname(absolutePath).toLowerCase() !== ".md") {
        throw new Error(`Public reference ${source.id} has an unsafe source path.`);
      }
      const content = await readFile(absolutePath, "utf8");
      if (content.trim().length < 80) {
        throw new Error(`Public reference ${source.id} is empty or incomplete.`);
      }
      return { source, content };
    }),
  );

  await rm(preparedDir, { recursive: true, force: true });
  await mkdir(preparedDir, { recursive: true });
  await mkdir(srcGeneratedDir, { recursive: true });

  const manifest: SourceManifestEntry[] = [];
  for (const source of websiteSources) {
    const fileName = `website__${source.id}.md`;
    const relativePath = `knowledge/generated/prepared/${fileName}`;
    await writeFile(path.join(preparedDir, fileName), websiteMarkdown(source), "utf8");
    const conflictingTopics = conflictingTopicsForWebsiteSource(source);
    manifest.push({
      id: source.id,
      fileName,
      documentPath: relativePath,
      title: source.title,
      url: source.canonicalUrl,
      fetchedAt: source.fetchedAt,
      sourceType: "official_website",
      priority: 50,
      ...(conflictingTopics.length > 0 ? { conflictingTopics } : {}),
    });
  }

  const approvedFaq = faqEntries.filter((entry) => entry.status === "approved");
  for (const entry of approvedFaq) {
    const fileName = `manager_faq__${entry.id}.md`;
    const relativePath = `knowledge/generated/prepared/${fileName}`;
    await writeFile(path.join(preparedDir, fileName), faqMarkdown(entry), "utf8");
    manifest.push({
      id: entry.id,
      fileName,
      documentPath: relativePath,
      title: entry.question,
      sourceType: "manager_faq",
      priority: 100,
    });
  }

  for (const { source, content } of officialDocumentFiles) {
    const fileName = `official_document__${source.id}.pdf`;
    const relativePath = `knowledge/generated/prepared/${fileName}`;
    await writeFile(path.join(preparedDir, fileName), content);
    manifest.push({
      id: source.id,
      fileName,
      documentPath: relativePath,
      title: source.title,
      url: source.url,
      sourceType: "official_document",
      priority: 75,
      contentHash: source.contentHash,
    });
  }

  for (const { source, content } of publicReferenceFiles) {
    const fileName = `official_reference__${source.id}.md`;
    const relativePath = `knowledge/generated/prepared/${fileName}`;
    await writeFile(
      path.join(preparedDir, fileName),
      publicReferenceMarkdown(source, content),
      "utf8",
    );
    manifest.push({
      id: source.id,
      fileName,
      documentPath: relativePath,
      title: source.title,
      url: source.url,
      sourceType: "official_reference",
      priority: 90,
    });
  }

  const unresolvedFaq = faqEntries.filter((entry) => entry.status !== "approved");
  const conflicts = faqEntries
    .filter((entry) => entry.status === "conflicting")
    .map((entry) => ({ id: entry.id, question: entry.question, notes: entry.notes }));
  const missingLinks = approvedFaq
    .filter(
      (entry) =>
        /\b(?:page|webpage|form)\b/i.test(entry.answer) &&
        entry.relatedUrls.length === 0,
    )
    .map((entry) => ({ id: entry.id, question: entry.question }));
  const existingStore = await readJsonIfPresent(
    path.join(generatedDir, "file-search-store.json"),
  );
  const storeName =
    existingStore &&
    typeof existingStore === "object" &&
    typeof (existingStore as Record<string, unknown>).storeName === "string"
      ? String((existingStore as Record<string, unknown>).storeName)
      : null;

  const syncReport = {
    preparedAt: new Date().toISOString(),
    successfullyIndexedPages: crawlReport.indexedPages ?? [],
    failedPages: crawlReport.failedPages ?? [],
    duplicatePages: crawlReport.duplicatePages ?? [],
    retainedPages: crawlReport.retainedPages ?? [],
    approvedRemovedPages: crawlReport.approvedRemovedPages ?? [],
    pendingFaqEntries: unresolvedFaq.map((entry) => ({
      id: entry.id,
      question: entry.question,
      status: entry.status,
      notes: entry.notes,
    })),
    pendingFaqWebsiteMatches: potentialWebsiteMatches(
      unresolvedFaq,
      websiteSources,
    ),
    conflictingInformation: conflicts,
    missingLinks,
    unmappedSourceDocuments: [],
    totalDocumentsPrepared: manifest.length,
    officialDocuments: officialDocuments.map(({ id, title, url }) => ({
      id,
      title,
      url,
    })),
    officialReferences: publicReferenceSources.map(
      ({ id, title, url, verifiedOn }) => ({ id, title, url, verifiedOn }),
    ),
    totalDocumentsUploaded: 0,
    uploadFailures: [],
    fileSearchStoreName: storeName,
  };

  await Promise.all([
    writeFile(
      path.join(generatedDir, "sources.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(srcGeneratedDir, "knowledge-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(generatedDir, "sync-report.json"),
      `${JSON.stringify(syncReport, null, 2)}\n`,
      "utf8",
    ),
  ]);

  return { manifest, syncReport };
}

async function main() {
  const { manifest, syncReport } = await prepareKnowledge();
  process.stdout.write(
    `Prepared ${manifest.length} approved documents (${String(syncReport.pendingFaqEntries.length)} FAQ entries withheld).\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown preparation error";
    process.stderr.write(`Knowledge preparation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
