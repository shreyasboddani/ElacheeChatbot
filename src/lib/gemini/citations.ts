import { isApprovedWebsiteUrl } from "@/lib/config";
import type {
  ChatSource,
  SourceManifestEntry,
} from "@/lib/knowledge/types";

export interface FileCitationAnnotation {
  type?: string;
  file_name?: string;
  document_uri?: string;
  custom_metadata?: unknown;
}

function metadataValue(
  metadata: unknown,
  key: string,
): string | undefined {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.key !== key) continue;
      const value = record.stringValue ?? record.string_value;
      if (typeof value === "string") return value;
    }
    return undefined;
  }
  if (typeof metadata === "object") {
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export function resolveFileCitations(
  annotations: FileCitationAnnotation[],
  manifest: SourceManifestEntry[],
): ChatSource[] {
  const resolved = new Map<string, ChatSource>();

  for (const annotation of annotations) {
    if (annotation.type && annotation.type !== "file_citation") continue;
    const sourceId = metadataValue(annotation.custom_metadata, "source_id");
    const references = [
      sourceId,
      annotation.file_name,
      annotation.document_uri,
    ].filter((value): value is string => Boolean(value));

    const entry = manifest.find((candidate) =>
      references.some((reference) =>
        [candidate.id, candidate.fileName, candidate.documentPath]
          .map((value) => value.toLowerCase())
          .includes(reference.toLowerCase()),
      ),
    );
    if (!entry) continue;
    if (
      (entry.sourceType === "official_website" ||
        entry.sourceType === "official_document") &&
      (!entry.url || !isApprovedWebsiteUrl(entry.url))
    ) {
      continue;
    }

    resolved.set(entry.id, {
      id: entry.id,
      title:
        entry.sourceType === "manager_faq"
          ? "Information provided by Elachee staff"
          : entry.title,
      ...(entry.url ? { url: entry.url } : {}),
      sourceType: entry.sourceType,
    });
  }

  return [...resolved.values()];
}

