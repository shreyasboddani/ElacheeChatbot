import { describe, expect, it } from "vitest";

import { resolveFileCitations } from "@/lib/gemini/citations";
import type { SourceManifestEntry } from "@/lib/knowledge/types";

const websiteSource: SourceManifestEntry = {
  id: "food-donations",
  fileName: "website__food-donations.md",
  documentPath: "knowledge/generated/prepared/website__food-donations.md",
  title: "Food Donations",
  url: "https://elachee.org/food-donations",
  sourceType: "official_website",
  priority: 50,
};

describe("citation resolution", () => {
  it("resolves a valid website citation through custom metadata", () => {
    const sources = resolveFileCitations(
      [
        {
          type: "file_citation",
          file_name: "display-name.md",
          custom_metadata: { source_id: "food-donations" },
        },
      ],
      [websiteSource],
    );
    expect(sources).toEqual([
      {
        id: "food-donations",
        title: "Food Donations",
        url: "https://elachee.org/food-donations",
        sourceType: "official_website",
      },
    ]);
  });

  it("resolves an approved public official-document citation", () => {
    const officialDocument: SourceManifestEntry = {
      id: "elachee-staff-guide",
      fileName: "official_document__elachee-staff-guide.pdf",
      documentPath:
        "knowledge/generated/prepared/official_document__elachee-staff-guide.pdf",
      title: "Elachee Staff Guide",
      url: "https://elachee.org/resources/staff-guide",
      sourceType: "official_document",
      priority: 75,
      contentHash: "a".repeat(64),
    };
    expect(
      resolveFileCitations(
        [
          {
            type: "file_citation",
            file_name: officialDocument.fileName,
            custom_metadata: { source_id: officialDocument.id },
          },
        ],
        [officialDocument],
      ),
    ).toEqual([
      {
        id: officialDocument.id,
        title: officialDocument.title,
        url: officialDocument.url,
        sourceType: "official_document",
      },
    ]);
  });

  it("drops unmapped citations", () => {
    expect(
      resolveFileCitations(
        [{ type: "file_citation", file_name: "unknown.md" }],
        [websiteSource],
      ),
    ).toEqual([]);
  });

  it("rejects unsupported website source URLs", () => {
    expect(
      resolveFileCitations(
        [{ type: "file_citation", file_name: "bad.md" }],
        [{ ...websiteSource, fileName: "bad.md", url: "https://example.com" }],
      ),
    ).toEqual([]);
  });
});

