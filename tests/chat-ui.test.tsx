import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "@/components/chatbot/ChatInput";
import { ChatMessage } from "@/components/chatbot/ChatMessage";
import { QuickActions } from "@/components/chatbot/QuickActions";
import { SourceCards } from "@/components/chatbot/SourceCards";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { CHAT_UI_COPY } from "@/lib/chat/language";

afterEach(cleanup);

describe("chat input and quick actions", () => {
  it("captures and trims input before clearing it", () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);
    const input = screen.getByLabelText("Ask the Elachee Nature Guide");
    fireEvent.change(input, { target: { value: "  What should I know before visiting Elachee?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("What should I know before visiting Elachee?");
    expect(onSend.mock.calls[0]?.[0]).not.toHaveProperty("preventDefault");
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  it("routes Enter and the submit button through the same callback", () => {
    const onSend = vi.fn();
    render(<ChatInput disabled={false} onSend={onSend} />);
    const input = screen.getByLabelText("Ask the Elachee Nature Guide");
    fireEvent.change(input, { target: { value: "First question?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    fireEvent.change(input, { target: { value: "Second question?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend.mock.calls.map(([value]) => value)).toEqual([
      "First question?",
      "Second question?",
    ]);
  });

  it("shows and enforces the browser message limit", () => {
    render(<ChatInput disabled={false} onSend={vi.fn()} />);
    const input = screen.getByLabelText("Ask the Elachee Nature Guide");
    expect(input.getAttribute("maxlength")).toBe(String(MAX_MESSAGE_LENGTH));
    fireEvent.change(input, {
      target: { value: "x".repeat(MAX_MESSAGE_LENGTH + 25) },
    });
    expect((input as HTMLTextAreaElement).value).toHaveLength(
      MAX_MESSAGE_LENGTH,
    );
    expect(
      screen.getByText(`${MAX_MESSAGE_LENGTH}/${MAX_MESSAGE_LENGTH}`),
    ).toBeDefined();
  });

  it("sends quick actions as natural-language strings", () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Plan my visit" }));
    expect(onSelect).toHaveBeenCalledWith(CHAT_UI_COPY.en.quickActions[0].question);
    expect(typeof onSelect.mock.calls[0]?.[0]).toBe("string");
  });

  it("localizes the composer and quick actions in Spanish", () => {
    const onSelect = vi.fn();
    render(
      <>
        <ChatInput disabled={false} onSend={vi.fn()} language="es" />
        <QuickActions onSelect={onSelect} language="es" />
      </>,
    );
    expect(screen.getByLabelText(/Preg.ntale a la Gu.a de Naturaleza de Elachee/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Planificar mi visita" }));
    expect(onSelect).toHaveBeenCalledWith(CHAT_UI_COPY.es.quickActions[0].question);
  });
});

describe("safe message rendering", () => {
  it("renders supported Markdown for assistant answers", () => {
    render(
      <ChatMessage
        message={{
          id: "assistant-markdown",
          role: "assistant",
          includeInHistory: true,
          content:
            "### Visit planning\n\n**Start here**\n\n- Visitor center\n- Trails\n\n1. Check hours\n2. Ask for details\n\nUse `Elachee` when relevant.",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Visit planning" })).toBeDefined();
    expect(screen.getByText("Start here").tagName).toBe("STRONG");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("Elachee").tagName).toBe("CODE");
  });

  it("keeps user content escaped and plain", () => {
    const { container } = render(
      <ChatMessage
        message={{
          id: "user-text",
          role: "user",
          includeInHistory: true,
          content: "<img src=x onerror=alert(1)> **not bold**",
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(
      screen.getByText("<img src=x onerror=alert(1)> **not bold**"),
    ).toBeDefined();
  });

  it("does not render raw HTML in assistant Markdown", () => {
    const { container } = render(
      <ChatMessage
        message={{
          id: "assistant-html",
          role: "assistant",
          includeInHistory: true,
          content: "Safe text <script>alert('x')</script> <img src=x>",
        }}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not make unsupported Markdown URLs clickable", () => {
    render(
      <ChatMessage
        message={{
          id: "bad-link",
          role: "assistant",
          includeInHistory: true,
          content: "[Unknown site](https://example.com/private)",
        }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Unknown site").tagName).toBe("SPAN");
  });

  it("does not load model-generated Markdown images", () => {
    const { container } = render(
      <ChatMessage
        message={{
          id: "external-image",
          role: "assistant",
          includeInHistory: true,
          content: "![Tracking pixel](https://example.com/pixel.png)",
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Tracking pixel").tagName).toBe("SPAN");
  });

  it("allows approved Elachee Markdown links safely", () => {
    render(
      <ChatMessage
        message={{
          id: "good-link",
          role: "assistant",
          includeInHistory: true,
          content:
            "[Plan a visit](https://elachee.org/visit/)",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: "Plan a visit" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows only linked source cards and omits staff text without a URL", () => {
    render(
      <SourceCards
        sources={[
          {
            id: "staff",
            title: "Information provided by Elachee staff",
            sourceType: "manager_faq",
          },
          {
            id: "website",
            title: "Plan Your Visit | Elachee Nature Science Center",
            url: "https://elachee.org/visit/",
            sourceType: "official_website",
          },
          {
            id: "staff-guide",
            title: "Elachee Staff Guide",
            url: "https://elachee.org/resources/staff-guide",
            sourceType: "official_document",
          },
        ]}
      />,
    );
    expect(
      screen.queryByText("Information provided by Elachee staff"),
    ).toBeNull();
    const website = screen.getByRole("link", {
      name: /Plan Your Visit.*View on the Elachee website/,
    });
    expect(website.getAttribute("href")).toBe(
      "https://elachee.org/visit/",
    );
    expect(
      screen.getByRole("link", { name: /Elachee Staff Guide.*View on the Elachee website/ }),
    ).toBeDefined();
  });

  it("deduplicates source cards that resolve to the same official URL", () => {
    render(
      <SourceCards
        sources={[
          {
            id: "website-a",
            title: "Plan Your Visit",
            url: "https://elachee.org/visit/",
            sourceType: "official_website",
          },
          {
            id: "website-b",
            title: "Duplicate Plan Your Visit",
            url: "https://elachee.org/visit/",
            sourceType: "official_website",
          },
        ]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
