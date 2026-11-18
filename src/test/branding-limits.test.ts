import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BRANDING_IMAGE_MIME_TYPES, MAX_BRANDING_IMAGE_BYTES } from "@/lib/constants";

// The branding bucket's limits are set in the migration, and the app checks the same ones before
// an upload. This keeps the two in step: a change to one fails here until the other follows.
const migration = readFileSync("supabase/migrations/20261119120000_customer_branding.sql", "utf8");

/** The values of the statement that creates the bucket: id, name, public, size, types. */
function bucketValues(): string {
  const match = /values \('branding', 'branding', false, (.+)\)\non conflict/.exec(migration);
  if (!match?.[1]) throw new Error("The branding bucket's insert is not in the migration");
  return match[1];
}

describe("the branding bucket's limits", () => {
  it("allow the same file size as the app", () => {
    const size = bucketValues().split(",")[0]!.trim();
    const bytes = size.split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
    expect(bytes).toBe(MAX_BRANDING_IMAGE_BYTES);
  });

  it("allow the same file types as the app, and no SVG", () => {
    const types = [...bucketValues().matchAll(/'(image\/[a-z+]+)'/g)].map((match) => match[1]);
    expect(types).toEqual([...BRANDING_IMAGE_MIME_TYPES]);
    expect(types).not.toContain("image/svg+xml");
  });
});
