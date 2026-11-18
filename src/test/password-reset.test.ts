import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestPasswordReset, resetOwnPassword, verifyRecovery } from "@/lib/api/auth";
import { errorCode } from "@/lib/errors";
import { fieldErrors, passwordResetSchema } from "@/lib/validation";

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const TOKEN_HASH = "0123456789abcdef";
const failure = (message: string, status: number, code: string) => ({
  data: {},
  error: new AuthApiError(message, status, code),
});

describe("asking for a reset link (ATS-51)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends the trimmed address to Auth", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await requestPasswordReset("  kund@lumen.test ");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("kund@lumen.test");
  });

  it("answers a repeat request for an existing account like a sent one, so no address stands out", async () => {
    auth.resetPasswordForEmail.mockResolvedValue(
      failure(
        "For security purposes, you can only request this after 42 seconds.",
        429,
        "over_email_send_rate_limit",
      ),
    );
    await expect(requestPasswordReset("kund@lumen.test")).resolves.toBeUndefined();
  });

  it("passes on other failures", async () => {
    auth.resetPasswordForEmail.mockResolvedValue(
      failure("Request rate limit reached", 429, "over_request_rate_limit"),
    );
    expect(errorCode(await requestPasswordReset("kund@lumen.test").catch((e: unknown) => e))).toBe(
      "too_many_attempts",
    );
  });
});

describe("using a reset link (ATS-51)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("verifies the link's token as a recovery", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "kund@lumen.test" }, session: {} },
      error: null,
    });
    await expect(verifyRecovery(TOKEN_HASH)).resolves.toEqual({
      id: "u1",
      email: "kund@lumen.test",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN_HASH, type: "recovery" });
  });

  it("says the link is no longer valid when it expired, was used or was replaced", async () => {
    auth.verifyOtp.mockResolvedValue(
      failure("Email link is invalid or has expired", 403, "otp_expired"),
    );
    expect(errorCode(await verifyRecovery(TOKEN_HASH).catch((e: unknown) => e))).toBe(
      "reset_link_invalid",
    );
  });

  it("refuses a deleted account, or a member of a deleted company", async () => {
    auth.verifyOtp.mockResolvedValue(failure("User is banned", 403, "user_banned"));
    expect(errorCode(await verifyRecovery(TOKEN_HASH).catch((e: unknown) => e))).toBe(
      "account_or_company_deleted",
    );
  });
});

describe("saving the new password (ATS-51)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets the password, then signs out the user's other devices", async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    await expect(resetOwnPassword("Blå-Katt-47")).resolves.toEqual({
      otherSessionsSignedOut: true,
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Blå-Katt-47" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("reports other devices it could not sign out", async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({
      error: new AuthApiError("Server error", 500, "unexpected_failure"),
    });
    await expect(resetOwnPassword("Blå-Katt-47")).resolves.toEqual({
      otherSessionsSignedOut: false,
    });
  });

  it("signs nothing out when the password is refused", async () => {
    auth.updateUser.mockResolvedValue(failure("Same password", 422, "same_password"));
    expect(errorCode(await resetOwnPassword("Blå-Katt-47").catch((e: unknown) => e))).toBe(
      "same_password",
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("the reset form's address", () => {
  const errorsFor = (email: string) => {
    const parsed = passwordResetSchema.safeParse({ email });
    return parsed.success ? {} : fieldErrors(passwordResetSchema, parsed.error);
  };

  it("needs a valid address and trims it", () => {
    expect(errorsFor("")).toEqual({ email: "email_invalid" });
    expect(errorsFor("kund@")).toEqual({ email: "email_invalid" });
    expect(errorsFor(`${"a".repeat(250)}@lumen.test`)).toEqual({ email: "too_long" });
    expect(passwordResetSchema.parse({ email: " kund@lumen.test " })).toEqual({
      email: "kund@lumen.test",
    });
  });
});
