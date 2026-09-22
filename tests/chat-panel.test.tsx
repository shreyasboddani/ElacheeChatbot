import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "@/components/chatbot/ChatPanel";

const staffSource = {
  id: "staff-answer",
  title: "Information provided by Elachee staff",
  sourceType: "manager_faq" as const,
};

function answered(answer: string) {
  return {
    status: "answered",
    answer,
    sources: [staffSource],
    contactRecommended: false,
  };
}

function mockHttpResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatPanel request pipeline", () => {
  it("uses approved-information wording without exposing staff-source labels", () => {
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Official Elachee information/i)).toBeDefined();
    expect(screen.queryByText(/staff-provided/i)).toBeNull();
  });

  it("sends a quick action through the normal JSON request pipeline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockHttpResponse(answered("You can plan a visit to Elachee.")),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Plan my visit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Chat-Language": "auto",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      message: "What should I know before visiting Elachee?",
      history: [],
      language: "auto",
    });
  });

  it("sends typed input and follow-up history with only role and content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockHttpResponse(answered("Elachee offers confirmed visit information.")),
      )
      .mockResolvedValueOnce(
        mockHttpResponse(answered("Saturday has a separate next step.")),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText("Ask the Elachee Nature Guide");
    fireEvent.change(input, { target: { value: "  I need Elachee visit information.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Elachee offers confirmed visit information.");

    fireEvent.change(input, { target: { value: "What about Saturday?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(firstInit.body as string)).toEqual({
      message: "I need Elachee visit information.",
      history: [],
      language: "auto",
    });
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(secondInit.body as string)).toEqual({
      message: "What about Saturday?",
      history: [
        { role: "user", content: "I need Elachee visit information." },
        {
          role: "assistant",
          content: "Elachee offers confirmed visit information.",
        },
      ],
      language: "auto",
    });
  });

  it("prevents a duplicate submission while the first request is pending", () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Ask the Elachee Nature Guide");
    const form = input.closest("form");
    fireEvent.change(input, { target: { value: "What should I know before visiting Elachee?" } });
    if (!form) throw new Error("Chat form not found");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a specific invalid-request response and excludes it from later history", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockHttpResponse({
          status: "invalid_request",
          answer:
            "The browser could not validate the recent conversation. Please restart the chat and try again.",
          sources: [],
          contactRecommended: false,
        }),
      )
      .mockResolvedValueOnce(mockHttpResponse(answered("A grounded answer.")));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Ask the Elachee Nature Guide");

    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/browser could not validate/i);
    fireEvent.change(input, { target: { value: "Second question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      message: "Second question",
      history: [],
      language: "auto",
    });
  });

  it("shows a visible language selector and sends localized Spanish questions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockHttpResponse(answered("Puedes planificar una visita a Elachee.")),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("Language")).toBeDefined();
    expect(
      screen.getByRole("group", { name: "Response language" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Espa.ol/ }));
    expect(screen.getByText(/Puedo ayudarte a encontrar informaci.n aprobada/i)).toBeDefined();
    expect(screen.getByLabelText(/Preg.ntale a la Gu.a de Naturaleza de Elachee/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Planificar mi visita" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Chat-Language": "es",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      message: "\u00bfQu\u00e9 debo saber antes de visitar Elachee?",
      history: [],
      language: "es",
    });
  });

  it("offers bounded keyboard resizing only for the floating panel", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    const { unmount } = render(
      <ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      width: 390,
      height: 650,
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 650,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.keyDown(
      screen.getByRole("button", { name: /Resize chat/i }),
      { key: "ArrowRight" },
    );
    expect(dialog.style.width).toBe("406px");
    expect(dialog.style.height).toBe("650px");
    unmount();

    render(
      <ChatPanel embedded onMinimize={vi.fn()} onClose={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Resize chat/i }),
    ).toBeNull();
  });

  it("resizes the floating panel by dragging its corner handle", () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 1000);
    render(<ChatPanel onMinimize={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      width: 390,
      height: 650,
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 650,
      left: 0,
      toJSON: () => ({}),
    });
    const handle = screen.getByRole("button", { name: /Resize chat/i });

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 7,
      clientX: 50,
      clientY: 40,
    });
    fireEvent.pointerUp(handle, { pointerId: 7 });

    expect(dialog.style.width).toBe("340px");
    expect(dialog.style.height).toBe("710px");
  });
});
