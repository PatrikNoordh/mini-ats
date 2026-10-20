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
    expect(authErrorCode(new AuthApiError("Banned", 400, "user_banned"))).toBeNull();
    expect(authErrorCode(new Error("boom"))).toBeNull();
  });
});

describe("profile row", () => {
  const row = {
    id: "00000000-0000-0000-0000-0000000000a1",
    role: "customer",
    full_name: "Karin Exempel",
    company_name: "Nordkust Bygg AB",
    email: "karin@nordkust.test",
    created_at: "2026-10-20T08:00:00+00:00",
  };

  it("reads the role from the row", () => {
    expect(parseProfileRow(row).role).toBe("customer");
    expect(parseProfileRow({ ...row, role: "admin" }).role).toBe("admin");
  });

  it("shows missing names and email as empty text", () => {
    const profile = parseProfileRow({ ...row, full_name: null, company_name: null, email: null });
    expect(profile).toMatchObject({ full_name: "", company_name: "", email: "" });
  });

  it("rejects a role the app does not know", () => {
    expect(() => parseProfileRow({ ...row, role: "owner" })).toThrow();
    expect(() => parseProfileRow({ ...row, role: null })).toThrow();
  });
});
