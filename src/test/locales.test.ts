import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import sv from "@/locales/sv.json";

type Tree = { [key: string]: string | Tree };

/** Flattens nested locale objects to "a.b.c" → value. */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const svKeys = flatten(sv);
const enKeys = flatten(en);

describe("locale files", () => {
  it("sv and en have exactly the same keys", () => {
    expect([...enKeys.keys()].sort()).toEqual([...svKeys.keys()].sort());
  });

  it.each([
    ["sv", svKeys],
    ["en", enKeys],
  ])("%s has no empty values", (_lang, keys) => {
    const empty = [...keys].filter(([, value]) => value.trim() === "").map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("each key uses the same placeholders in both languages", () => {
    const mismatched = [...svKeys]
      .filter(([key, value]) => {
        const other = enKeys.get(key);
        return other !== undefined && placeholders(value).join() !== placeholders(other).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
