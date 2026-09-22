import { describe, expect, it } from "vitest";

import { securityHeaders } from "../next.config";

describe("security headers", () => {
  it("sets browser hardening while preserving Elachee iframe integration", () => {
    const headers = new Map(
      securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
    );
    const csp = headers.get("content-security-policy") ?? "";

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain(
      "frame-ancestors 'self' https://elachee.org https://www.elachee.org https://*.elachee.org",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });
});
