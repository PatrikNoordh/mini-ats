import { describe, expect, it } from "vitest";

import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import {
  accountFormFields,
  accountInputSchema,
  accountUpdateSchema,
  fieldErrors,
  NEW_COMPANY,
  NO_COMPANY,
  utf8Length,
} from "@/lib/validation";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";

describe("account form", () => {
  const input = {
    role: "customer",
    full_name: "Karin Exempel",
    company: NEW_COMPANY,
    company_name: "Nordkust Bygg AB",
    email: "karin@nordkust.test",
    password: "long-enough",
  };

  function errorsFor(
    values: Partial<typeof input>,
    schema: typeof accountInputSchema | typeof accountUpdateSchema = accountInputSchema,
  ) {
    const result = schema.safeParse({ ...input, ...values });
    return result.success ? {} : fieldErrors(accountFormFields, result.error);
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

  it("requires a name, a new company's name and a valid email", () => {
    expect(errorsFor({ full_name: " ", company_name: " ", email: "karin" })).toEqual({
      full_name: "name_required",
      company_name: "company_required",
      email: "email_invalid",
    });
  });

  it("puts a new customer in an existing company or a new one, never in none", () => {
    expect(errorsFor({ company: COMPANY, company_name: "" })).toEqual({});
    expect(errorsFor({ company: "", company_name: "" })).toEqual({ company: "company_choose" });
    expect(errorsFor({ company: NO_COMPANY })).toEqual({ company: "company_choose" });
  });

  it("lets an edit take a customer out of their company, but not make a new one", () => {
    const edit = { password: "" };
    expect(errorsFor({ ...edit, company: NO_COMPANY }, accountUpdateSchema)).toEqual({});
    expect(errorsFor({ ...edit, company: COMPANY }, accountUpdateSchema)).toEqual({});
    expect(errorsFor({ ...edit, company: NEW_COMPANY }, accountUpdateSchema)).toEqual({
      company: "company_choose",
    });
  });

  it("asks an admin for no company", () => {
    expect(errorsFor({ role: "admin", company: "", company_name: "" })).toEqual({});
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
