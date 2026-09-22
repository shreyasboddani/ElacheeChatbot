import { describe, expect, it } from "vitest";

import { containsLikelySensitiveInformation } from "@/lib/security/sensitive-data";

describe("sensitive data detection", () => {
  it("detects a Social Security number pattern", () => {
    expect(
      containsLikelySensitiveInformation("Here is my SSN: 123-45-6789"),
    ).toBe(true);
  });

  it("detects a valid card-like number", () => {
    expect(
      containsLikelySensitiveInformation("My card is 4111 1111 1111 1111"),
    ).toBe(true);
  });

  it("does not block an ordinary phone-number question", () => {
    expect(
      containsLikelySensitiveInformation(
        "Can I call Elachee at 770-887-1098 about volunteering?",
      ),
    ).toBe(false);
  });
});

