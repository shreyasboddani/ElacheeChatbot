import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  collapseRecurringCalendarOccurrences,
  isAllowedByRobots,
  isCalendarPaginationLink,
  isCrawlableUrl,
  parseApprovedRemovalUrls,
  parseRobotsTxt,
} from "../scripts/crawl-website";
import type { WebsiteSource } from "../src/lib/knowledge/types";

function calendarSource(
  overrides: Partial<WebsiteSource> & { canonicalUrl: string; title: string; text: string },
): WebsiteSource {
  return {
    id: `web-${overrides.canonicalUrl}`,
    fetchedAt: "2026-08-23T00:00:00.000Z",
    headings: [],
    links: [],
    sourceType: "official_website",
    ...overrides,
  };
}
import { isValidWidgetUrl } from "@/lib/widget/url-validation";
import { parseEmbedPresentation } from "@/lib/widget/presentation";

describe("widget and crawler boundaries", () => {
  it("validates widget URLs and requires HTTPS outside localhost", () => {
    expect(isValidWidgetUrl("https://prototype.vercel.app/embed")).toBe(true);
    expect(isValidWidgetUrl("http://localhost:3000/embed")).toBe(true);
    expect(isValidWidgetUrl("http://example.com/embed")).toBe(false);
    expect(isValidWidgetUrl("javascript:alert(1)")).toBe(false);
  });

  it("constrains embed options to an allowlist", () => {
    expect(
      parseEmbedPresentation({
        theme: "url(javascript:bad)",
        launcher: "anything",
        position: "center",
      }),
    ).toEqual({
      theme: "light",
      launcherVisible: false,
      position: "bottom-left",
    });
  });

  it("uses the local Elachee logo in the framework-independent launcher", () => {
    const loader = readFileSync("public/widget-loader.js", "utf8");
    expect(loader).toContain("/branding/elachee-logo.png");
    expect(loader).toContain('logoImage.alt = ""');
    expect(loader).toContain("chatbotUrl.origin !== scriptUrl.origin");
    expect(loader).toContain('resizeButton.addEventListener("pointerdown"');
    expect(loader).toContain('resizeButton.addEventListener("keydown"');
    expect(loader).toContain(".el-resize{display:none}");
    expect(loader).toContain('script.getAttribute("data-prompt")');
    expect(loader).toContain('script.getAttribute("data-prompt-text")');
    expect(loader).toContain('iframe.loading = "eager"');
    expect(loader).toContain("Loading Elachee assistant");
    expect(loader).toContain('panel.setAttribute("data-ready", "true")');
    expect(loader).toContain('"elachee-chatbot:close"');
    expect(loader).toContain("event.source !== iframe.contentWindow");
    expect(loader).toContain("event.origin !== chatbotUrl.origin");
    expect(loader).toContain("elachee-chatbot-nudge-seen");
    expect(loader).toContain("nudgeText.textContent = promptText");
    expect(loader).toContain('nudgeAction.addEventListener("click"');
    expect(loader).toContain('nudgeClose.addEventListener("click"');
  });

  it("keeps the crawler on public Elachee HTML routes", () => {
    expect(isCrawlableUrl("https://elachee.org/food-pantry/?utm_source=x")).toBe(
      true,
    );
    expect(isCrawlableUrl("https://elachee.org/wp-admin/")).toBe(false);
    expect(isCrawlableUrl("https://example.com/food-pantry")).toBe(false);
    expect(isCrawlableUrl("https://elachee.org/brochure.pdf")).toBe(false);
  });

  it("honors robots allow rules over shorter disallow rules", () => {
    const rules = parseRobotsTxt(
      "User-agent: *\nDisallow: /private\nAllow: /private/public\n",
    );
    expect(
      isAllowedByRobots("https://elachee.org/private/page", rules),
    ).toBe(false);
    expect(
      isAllowedByRobots("https://elachee.org/private/public/info", rules),
    ).toBe(true);
  });

  it("stops following recurring calendar event Previous/Next chains", () => {
    expect(
      isCalendarPaginationLink(
        "https://elachee.org/calendar/free-ged-classes-dh7mh-hc34f-5s5zj-mrzzh-fty3x-ntp9b",
        "Next\nNext\nOctober 5\nFree GED Classes",
      ),
    ).toBe(true);
    expect(
      isCalendarPaginationLink(
        "https://elachee.org/calendar/free-ged-classes-dh7mh-hc34f-5s5zj-mrzzh-fty3x",
        "Previous\nPrevious\nSeptember 28\nFree GED Classes",
      ),
    ).toBe(true);
    expect(
      isCalendarPaginationLink(
        "https://elachee.org/calendar/red-robin-dine-to-donate",
        "Red Robin Dine to Donate",
      ),
    ).toBe(false);
    expect(
      isCalendarPaginationLink("https://elachee.org/calendar", "Back to All Events"),
    ).toBe(false);
    expect(
      isCalendarPaginationLink(
        "https://elachee.org/next-steps",
        "Next",
      ),
    ).toBe(false);
  });

  it("collapses recurring calendar occurrences to the nearest upcoming date", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    const sources = [
      calendarSource({
        canonicalUrl: "https://elachee.org/calendar/free-ged-classes-a",
        title: "Free GED Classes — Elachee",
        text: "Free GED Classes\nWednesday, August 12, 2026\n6:00 PM",
      }),
      calendarSource({
        canonicalUrl: "https://elachee.org/calendar/free-ged-classes-b",
        title: "Free GED Classes — Elachee",
        text: "Free GED Classes\nWednesday, September 2, 2026\n6:00 PM",
      }),
      calendarSource({
        canonicalUrl: "https://elachee.org/calendar/free-ged-classes-c",
        title: "Free GED Classes — Elachee",
        text: "Free GED Classes\nWednesday, August 26, 2026\n6:00 PM",
      }),
      calendarSource({
        canonicalUrl: "https://elachee.org/calendar/red-robin-dine-to-donate",
        title: "Red Robin Dine to Donate — Elachee",
        text: "Red Robin Dine to Donate\nThursday, October 1, 2026\n5:00 PM",
      }),
      calendarSource({
        canonicalUrl: "https://elachee.org/staff",
        title: "Staff — Elachee",
        text: "Non-calendar page content that should pass through untouched.",
      }),
    ];

    const collapsed = collapseRecurringCalendarOccurrences(sources, now);

    expect(collapsed).toHaveLength(3);
    expect(collapsed.map((source) => source.canonicalUrl).sort()).toEqual(
      [
        "https://elachee.org/calendar/free-ged-classes-c",
        "https://elachee.org/calendar/red-robin-dine-to-donate",
        "https://elachee.org/staff",
      ].sort(),
    );
  });

  it("rejects malformed and duplicate removal approvals", () => {
    expect(() => parseApprovedRemovalUrls({ canonicalUrls: "not-an-array" })).toThrow(
      "canonicalUrls array",
    );
    expect(() =>
      parseApprovedRemovalUrls({
        canonicalUrls: [
          "https://elachee.org/contact-us",
          "https://elachee.org/contact-us/",
        ],
      }),
    ).toThrow("Duplicate approved removal");
  });
});
