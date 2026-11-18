import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setOwnPassword, verifyInvite } from "@/lib/api/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { accountInviteSchema, fieldErrors, NEW_COMPANY, newPasswordSchema } from "@/lib/validation";

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), updateUser: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const TOKEN_HASH = "pkce_0123456789abcdef";

describe("accepting an invite (ATS-50)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("verifies the invite's token and returns the user it signed in", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "ny@exempelbygg.test" }, session: {} },
      error: null,
    });
    await expect(verifyInvite(TOKEN_HASH)).resolves.toEqual({
      id: "u1",
      email: "ny@exempelbygg.test",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN_HASH, type: "invite" });
  });

  it("says the link is no longer valid when it expired, was used or was replaced", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Email link is invalid or has expired", 403, "otp_expired"),
    });
    expect(errorCode(await verifyInvite(TOKEN_HASH).catch((e: unknown) => e))).toBe(
      "invite_invalid",
    );
  });

  it("names a deleted account or company as at sign-in", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("User is banned", 403, "user_banned"),
    });
    expect(errorCode(await verifyInvite(TOKEN_HASH).catch((e: unknown) => e))).toBe(
      "account_or_company_deleted",
    );
  });

  it("sets the new password, and passes on Auth's weak_password", async () => {
    auth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    await setOwnPassword("Blå-Katt-47");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Blå-Katt-47" });

    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError("Password is too weak", 422, "weak_password"),
    });
    expect(errorCode(await setOwnPassword("password").catch((e: unknown) => e))).toBe(
      "weak_password",
    );
  });
});

describe("the new password form", () => {
  const errorsFor = (input: { new_password: string; confirm_password: string }) => {
    const parsed = newPasswordSchema.safeParse(input);
    return parsed.success ? {} : fieldErrors(newPasswordSchema.innerType(), parsed.error);
  };

  it("accepts a password within the rules, typed twice", () => {
    expect(errorsFor({ new_password: "Blå-Katt-47", confirm_password: "Blå-Katt-47" })).toEqual({});
  });

  it("names a short password and a mismatch under their fields", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(errorsFor({ new_password: short, confirm_password: short })).toEqual({
      new_password: "password_too_short",
    });
    expect(errorsFor({ new_password: "Blå-Katt-47", confirm_password: "Blå-Katt-48" })).toEqual({
      confirm_password: "password_mismatch",
    });
  });
});

describe("the invite form", () => {
  const valid = {
    role: "customer",
    full_name: "Ny Användare",
    email: "ny@exempelbygg.test",
    password: "",
    company: NEW_COMPANY,
    company_name: "Exempelbygg AB",
  };

  it("needs no password, and the same company as a new account", () => {
    expect(accountInviteSchema.safeParse(valid).success).toBe(true);
    expect(accountInviteSchema.safeParse({ ...valid, company_name: "" }).success).toBe(false);
    expect(accountInviteSchema.safeParse({ ...valid, role: "admin", company: "" }).success).toBe(
      true,
    );
  });
});
