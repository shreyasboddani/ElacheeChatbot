import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "../src/app/api/knowledge/sync/route";

describe("knowledge synchronization cron route", () => {
  it("accepts only Vercel's configured cron secret", () => {
    expect(isAuthorizedCronRequest("Bearer secure-value", "secure-value")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer wrong", "secure-value")).toBe(false);
    expect(isAuthorizedCronRequest(null, "secure-value")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer secure-value", undefined)).toBe(false);
  });
});
