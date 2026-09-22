import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/chat/route";
import { resetRateLimitForTests } from "@/lib/security/rate-limit";

const originalKey = process.env.GEMINI_API_KEY;
const originalStore = process.env.GEMINI_FILE_SEARCH_STORE;

describe("chat API configuration failures", () => {
  beforeEach(() => resetRateLimitForTests());
  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalStore === undefined) delete process.env.GEMINI_FILE_SEARCH_STORE;
    else process.env.GEMINI_FILE_SEARCH_STORE = originalStore;
  });

  async function request() {
    return POST(
      new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "What should I know before visiting Elachee?", history: [] }),
      }),
    );
  }

  it("handles a missing Gemini key without crashing", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_FILE_SEARCH_STORE = "fileSearchStores/example";
    const response = await request();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("service_unavailable");
  });

  it("handles a missing File Search store without crashing", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_FILE_SEARCH_STORE;
    const response = await request();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("service_unavailable");
  });
});

