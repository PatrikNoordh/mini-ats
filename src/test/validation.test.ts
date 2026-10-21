import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { fieldErrors, isValidationKey, jobInputSchema, type ValidationKey } from "@/lib/validation";

describe("validation keys", () => {
  it("accepts the keys in validation.*", () => {
    expect(isValidationKey("title_required")).toBe(true);
    expect(isValidationKey("too_long")).toBe(true);
  });

  it("does not take inherited properties for keys", () => {
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(isValidationKey(key), key).toBe(false);
    }
  });
});

describe("fieldErrors", () => {
  it("drops a message that is only an inherited property", () => {
    const schema = z.object({ title: z.string().min(1, "constructor") });
    const result = schema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(schema, result.error)).toEqual({});
  });

  it("keeps the first error of each field", () => {
    const schema = z.object({ title: z.string().min(1, "title_required").email("email_invalid") });
    const result = schema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(schema, result.error)).toEqual({ title: "title_required" });
  });

  it("is typed by the schema's fields", () => {
    const result = jobInputSchema.safeParse({});
    if (result.success) return;
    const errors = fieldErrors(jobInputSchema, result.error);
    expectTypeOf(errors).toEqualTypeOf<
      Partial<Record<"title" | "location" | "description", ValidationKey>>
    >();
    // @ts-expect-error the job form has no email field
    expect(errors.email).toBeUndefined();
  });
});
