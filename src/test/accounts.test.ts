import { describe, expect, it } from "vitest";

import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { accountInputSchema, fieldErrors, utf8Length } from "@/lib/validation";

describe("account form", () => {
  const input = {
    role: "customer",
    full_name: "Karin Exempel",
    company_name: "Nordkust Bygg AB",
    email: "karin@nordkust.test",
    password: "long-enough",
  };

  function errorsFor(values: Partial<typeof input>) {
    const result = accountInputSchema.safeParse({ ...input, ...values });
    return result.success ? {} : fieldErrors(accountInputSchema, result.error);
  }

  it("trims the names and email but not the password", () => {
    expect(
      accountInputSchema.parse({
        ...input,
        full_name: " Karin ",
        email: " karin@nordkust.test ",
        password: " spaced out ",
      }),
    ).toMatchObject({ full_name: "Karin", email: "karin@nordkust.test", password: " spaced out " });
  });

  it("requires a name, a company and a valid email", () => {
    expect(errorsFor({ full_name: " ", company_name: "", email: "karin" })).toEqual({
      full_name: "name_required",
      company_name: "company_required",
      email: "email_invalid",
    });
  });

  // a@b.c passed the old loose check but fails the zod rule in admin-create-user.
  it("checks the email with the same rule as admin-create-user", () => {
    expect(errorsFor({ email: "a@b.c" })).toEqual({ email: "email_invalid" });
  });

  it("needs a password of at least the minimum length", () => {
    expect(errorsFor({ password: "x".repeat(MIN_PASSWORD_LENGTH - 1) })).toEqual({
      password: "password_too_short",
    });
    expect(errorsFor({ password: "x".repeat(MIN_PASSWORD_LENGTH) })).toEqual({});
  });

  it("counts the longest password in bytes, so å counts as two", () => {
    expect(utf8Length("å")).toBe(2);
    expect(errorsFor({ password: "å".repeat(MAX_PASSWORD_BYTES / 2) })).toEqual({});
    expect(errorsFor({ password: "å".repeat(MAX_PASSWORD_BYTES / 2 + 1) })).toEqual({
      password: "password_too_long",
    });
    expect(errorsFor({ password: "x".repeat(MAX_PASSWORD_BYTES + 1) })).toEqual({
      password: "password_too_long",
    });
  });
});
