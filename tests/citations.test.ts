import { describe, expect, it } from "vitest";

import { resolveFileCitations } from "@/lib/gemini/citations";
import type { SourceManifestEntry } from "@/lib/knowledge/types";

const websiteSource: SourceManifestEntry = {
  id: "elachee-trail-map",
  fileName: "website__elachee-trail-map.md",
  documentPath: "knowledge/generated/prepared/website__elachee-trail-map.md",
  title: "Elachee Trail Map",
  url: "https://elachee.org/resources/trail-map",
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
          custom_metadata: { source_id: "elachee-trail-map" },
        },
      ],
      [websiteSource],
    );
    expect(sources).toEqual([
      {
        id: "elachee-trail-map",
        title: "Elachee Trail Map",
        url: "https://elachee.org/resources/trail-map",
        sourceType: "official_website",
      },
    ]);
  });

  it("resolves a curated official reference to its canonical source page", () => {
    const hoursReference: SourceManifestEntry = {
      id: "visitor-hours",
      fileName: "official_reference__visitor-hours.md",
      documentPath:
        "knowledge/generated/prepared/official_reference__visitor-hours.md",
      title: "Elachee Visitor Center and Chicopee Woods Trail Hours",
      url: "https://elachee.org/hours",
      sourceType: "official_reference",
      priority: 90,
    };
    expect(
      resolveFileCitations(
        [
          {
            type: "file_citation",
            custom_metadata: { source_id: "visitor-hours" },
          },
        ],
        [hoursReference],
      ),
    ).toEqual([
      {
        id: "visitor-hours",
        title: "Elachee Visitor Center and Chicopee Woods Trail Hours",
        url: "https://elachee.org/hours",
        sourceType: "official_reference",
      },
    ]);
  });

  it("maps Gemini file references using the uploaded document basename", () => {
    expect(
      resolveFileCitations(
        [
          {
            type: "file_citation",
            source:
              "gs://approved-file-search/website__elachee-trail-map.md?part=1",
          },
        ],
        [websiteSource],
      ),
    ).toEqual([
      {
        id: "elachee-trail-map",
        title: "Elachee Trail Map",
        url: "https://elachee.org/resources/trail-map",
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

