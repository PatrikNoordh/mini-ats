import { describe, expect, it } from "vitest";

import themeCss from "@/styles.css?raw";
import { cn } from "@/lib/utils";

/** Size tokens defined in styles.css, as [utility prefix, token name]. */
const tokens = [...themeCss.matchAll(/--(width|max-height|text)-([a-z-]+):/g)].map(
  ([, kind, name]) =>
    [{ width: "w", "max-height": "max-h", text: "text" }[kind ?? ""], name] as const,
);

describe("size tokens in styles.css", () => {
  it("are found", () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  it.each(tokens)("%s-%s replaces a conflicting default class in cn()", (prefix, name) => {
    const fallback = { w: "w-full", "max-h": "max-h-screen", text: "text-sm" }[prefix ?? ""];
    expect(cn(fallback, `${prefix}-${name}`)).toBe(`${prefix}-${name}`);
  });
});
