import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_NUDGE_DELAY_MS,
  CHAT_NUDGE_SESSION_KEY,
  CHAT_NUDGE_VISIBLE_MS,
  ChatWidget,
  EMBED_CLOSE_MESSAGE_TYPE,
} from "@/components/chatbot/ChatWidget";

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("chat widget lifecycle", () => {
  it("preserves the browser-session draft when minimized", () => {
    render(<ChatWidget initialOpen />);
    const input = screen.getByLabelText("Ask The Place information assistant");
    fireEvent.change(input, { target: { value: "What about Dawson County?" } });

    fireEvent.click(screen.getByRole("button", { name: "Minimize chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Open The Place assistant" }));

    expect(
      (screen.getByLabelText(
        "Ask The Place information assistant",
      ) as HTMLTextAreaElement).value,
    ).toBe("What about Dawson County?");
  });

  it("starts a fresh conversation after the user closes the chat", () => {
    render(<ChatWidget initialOpen />);
    fireEvent.change(
      screen.getByLabelText("Ask The Place information assistant"),
      { target: { value: "A draft question" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Open The Place assistant" }));

    expect(
      (screen.getByLabelText(
        "Ask The Place information assistant",
      ) as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.getAllByText(/approved information from The Place/i)).toHaveLength(1);
  });

  it("does not reveal a second launcher when a hidden embedded chat is minimized", () => {
    render(
      <ChatWidget
        variant="embedded"
        initialOpen
        launcherVisible={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Minimize chat" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open The Place assistant" })).toBeNull();
    expect(EMBED_CLOSE_MESSAGE_TYPE).toBe("the-place-chatbot:close");
  });

  it("places the resize handle on the inward corner", () => {
    render(<ChatWidget initialOpen position="bottom-left" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("chat-panel-position-bottom-left");
    expect(
      screen.getByRole("button", { name: /Resize chat/i }),
    ).toBeDefined();
  });

  it("shows a delayed, non-focusing suggestion that opens the chat", () => {
    vi.useFakeTimers();
    render(<ChatWidget />);
    expect(screen.queryByText("Need help?")).toBeNull();

    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS));
    expect(screen.getByText("Need help?")).toBeDefined();
    expect(screen.getByText("Ask The Place chatbot")).toBeDefined();
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Need help? Open The Place chatbot",
      }),
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.queryByText("Need help?")).toBeNull();
    expect(window.sessionStorage.getItem(CHAT_NUDGE_SESSION_KEY)).toBe("true");
  });

  it("dismisses the suggestion and does not repeat it in the same session", () => {
    vi.useFakeTimers();
    const first = render(<ChatWidget />);
    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS));
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss chat suggestion" }),
    );
    expect(screen.queryByText("Need help?")).toBeNull();
    first.unmount();

    render(<ChatWidget />);
    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS + 100));
    expect(screen.queryByText("Need help?")).toBeNull();
  });

  it("automatically hides the suggestion without opening the chat", () => {
    vi.useFakeTimers();
    render(<ChatWidget />);
    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS));
    expect(screen.getByText("Need help?")).toBeDefined();

    act(() => vi.advanceTimersByTime(CHAT_NUDGE_VISIBLE_MS));
    expect(screen.queryByText("Need help?")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows the suggestion to be disabled and omits it from embedded chat", () => {
    vi.useFakeTimers();
    const disabled = render(<ChatWidget promptEnabled={false} />);
    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS + 100));
    expect(screen.queryByText("Need help?")).toBeNull();
    disabled.unmount();

    render(<ChatWidget variant="embedded" />);
    act(() => vi.advanceTimersByTime(CHAT_NUDGE_DELAY_MS + 100));
    expect(screen.queryByText("Need help?")).toBeNull();
  });
});
