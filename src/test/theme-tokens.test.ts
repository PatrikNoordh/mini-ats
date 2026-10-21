import { describe, expect, it } from "vitest";

import themeCss from "@/styles.css?raw";
import { cn } from "@/lib/utils";

/** Each kind of size token the test knows: its utility prefix and a default class it must replace. */
const KINDS = {
  width: { prefix: "w", fallback: "w-full" },
  "max-height": { prefix: "max-h", fallback: "max-h-screen" },
  text: { prefix: "text", fallback: "text-sm" },
} as const;

/** The custom properties in the `@theme { … }` block of styles.css (the size tokens). */
const sizeBlock = themeCss.match(/@theme\s*\{([^}]*)\}/)?.[1] ?? "";
const tokens = [...sizeBlock.matchAll(/--([a-z-]+):/g)].map(([, token]) => token ?? "");

/** The kind a token belongs to, or undefined when the test does not know it. */
function kindOf(token: string) {
  const entry = Object.entries(KINDS).find(([kind]) => token.startsWith(`${kind}-`));
  return entry && { ...entry[1], name: token.slice(entry[0].length + 1) };
}

describe("size tokens in styles.css", () => {
  it("are found", () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  it.each(tokens)("--%s is a kind the test knows", (token) => {
    expect(kindOf(token), `add the kind of --${token} to KINDS and to cn()`).toBeDefined();
  });

  it.each(tokens)("--%s replaces a conflicting default class in cn()", (token) => {
    const kind = kindOf(token);
    if (!kind) return; // reported by the test above
    expect(cn(kind.fallback, `${kind.prefix}-${kind.name}`)).toBe(`${kind.prefix}-${kind.name}`);
  });
});
