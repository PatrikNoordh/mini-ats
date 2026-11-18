import { describe, expect, it } from "vitest";

import { parseEmailEnabled } from "@/lib/features";

describe("VITE_EMAIL_ENABLED (ATS-50)", () => {
  it("is on only for the exact text true", () => {
    expect(parseEmailEnabled({ VITE_EMAIL_ENABLED: "true" })).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1", "yes", " true"])(
    "is off for %j, as in production",
    (value) => {
      expect(parseEmailEnabled({ VITE_EMAIL_ENABLED: value })).toBe(false);
    },
  );

  it("is off when the variable is not set at all", () => {
    expect(parseEmailEnabled({})).toBe(false);
  });
});
