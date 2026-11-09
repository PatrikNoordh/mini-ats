import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { authErrorCode } from "@/lib/api/auth";
import { parseProfileRow } from "@/lib/api/profiles";

describe("auth error codes", () => {
  it("maps a wrong email or password", () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    expect(authErrorCode(error)).toBe("invalid_credentials");
  });

  it("maps rate limiting, by code or by status", () => {
    expect(authErrorCode(new AuthApiError("Slow down", 429, "over_request_rate_limit"))).toBe(
      "too_many_attempts",
    );
    expect(authErrorCode(new AuthApiError("Slow down", 429, undefined))).toBe("too_many_attempts");
  });

  it("leaves network failures and other errors to the unknown message", () => {
    expect(authErrorCode(new AuthRetryableFetchError("Failed to fetch", 0))).toBeNull();
    expect(authErrorCode(new Error("boom"))).toBeNull();
  });

  it("maps a deleted account's blocked login", () => {
    expect(authErrorCode(new AuthApiError("User is banned", 400, "user_banned"))).toBe(
      "account_deleted",
    );
  });
});

describe("profile row", () => {
  const row = {
    id: "00000000-0000-0000-0000-0000000000a1",
    role: "customer",
    full_name: "Karin Exempel",
    email: "karin@nordkust.test",
    created_at: "2026-10-20T08:00:00+00:00",
    deleted_at: null,
    company_members: {
      company_id: "00000000-0000-0000-0000-0000000000c1",
      companies: { name: "Nordkust Bygg AB" },
    },
  };

  it("reads the role from the row", () => {
    expect(parseProfileRow(row).role).toBe("customer");
    expect(parseProfileRow({ ...row, role: "admin" }).role).toBe("admin");
  });

  it("shows missing names and email as empty text", () => {
    const profile = parseProfileRow({ ...row, full_name: null, email: null });
    expect(profile).toMatchObject({ full_name: "", email: "" });
  });

  it("reads the company and its name from the membership, not from the profile", () => {
    const profile = parseProfileRow({ ...row, company_name: "An old name" });
    expect(profile).toMatchObject({
      company_id: "00000000-0000-0000-0000-0000000000c1",
      company_name: "Nordkust Bygg AB",
    });
  });

  it("has no company without a membership, as for an admin", () => {
    const profile = parseProfileRow({ ...row, role: "admin", company_members: null });
    expect(profile).toMatchObject({ company_id: null, company_name: "" });
  });

  it("reads when the account was deleted", () => {
    expect(parseProfileRow(row).deleted_at).toBeNull();
    const deleted = "2026-10-22T10:00:00+00:00";
    expect(parseProfileRow({ ...row, deleted_at: deleted }).deleted_at).toBe(deleted);
  });

  it("rejects a role the app does not know", () => {
    expect(() => parseProfileRow({ ...row, role: "owner" })).toThrow();
    expect(() => parseProfileRow({ ...row, role: null })).toThrow();
  });
});
