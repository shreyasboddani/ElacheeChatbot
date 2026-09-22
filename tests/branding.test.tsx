import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";
import {
  LearnAILogo,
  ElacheeLogo,
} from "@/components/branding/BrandLogos";
import { ChatPanel } from "@/components/chatbot/ChatPanel";

afterEach(cleanup);

function imageSource(image: HTMLImageElement): string {
  return `${image.getAttribute("src") || ""} ${image.getAttribute("srcset") || ""}`;
}

describe("product branding", () => {
  it("uses the supplied Elachee and LearnAI image assets", () => {
    render(
      <>
        <ElacheeLogo />
        <LearnAILogo />
      </>,
    );
    expect(
      imageSource(screen.getByAltText("Elachee Nature Science Center") as HTMLImageElement),
    ).toContain("branding%2Felachee-logo.png");
    expect(
      imageSource(screen.getByAltText("LearnAI") as HTMLImageElement),
    ).toContain("branding%2Flearnai-logo.png");
  });

  it("brands the standalone page as Elachee and includes LearnAI attribution marks", () => {
    const { container } = render(<Home />);
    const sources = [...container.querySelectorAll("img")].map(imageSource);
    expect(
      sources.filter((source) => source.includes("elachee-logo.png")).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      sources.filter((source) => source.includes("learnai-logo.png")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows Elachee branding and the LearnAI mark inside the chat panel", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    const { container } = render(
      <ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    const sources = [...container.querySelectorAll("img")].map(imageSource);
    expect(
      sources.some((source) => source.includes("elachee-logo.png")),
    ).toBe(true);
    expect(
      sources.some((source) => source.includes("learnai-logo.png")),
    ).toBe(true);
  });
});
