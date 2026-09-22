import { isApprovedWebsiteUrl } from "@/lib/config";
import type {
  ChatSource,
  SourceManifestEntry,
} from "@/lib/knowledge/types";

export interface FileCitationAnnotation {
  type?: string;
  file_name?: string;
  document_uri?: string;
  source?: string;
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
      metadataValue(annotation.custom_metadata, "canonical_url"),
      annotation.file_name,
      annotation.document_uri,
      annotation.source,
    ].filter((value): value is string => Boolean(value));

    const entry = manifest.find((candidate) => {
      const approvedReferences = [
        candidate.id,
        candidate.fileName,
        candidate.documentPath,
        candidate.url,
      ].filter((value): value is string => Boolean(value));

      return references.some((reference) => {
        const normalized = reference.trim().toLowerCase();
        if (
          approvedReferences.some(
            (value) => value.trim().toLowerCase() === normalized,
          )
        ) {
          return true;
        }

        // Gemini may return a file URI or a full storage path instead of the
        // uploaded filename. Match only its exact basename, never a fuzzy name.
        let basename = normalized.split(/[\\/]/).at(-1) ?? normalized;
        try {
          basename = decodeURIComponent(basename);
        } catch {
          // Keep the original basename if it is not valid URI encoding.
        }
        basename = basename.split(/[?#]/, 1)[0] ?? basename;
        return basename === candidate.fileName.toLowerCase();
      });
    });
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

