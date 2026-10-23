import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authErrorCode, changePassword, sessionIsGone } from "@/lib/api/auth";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { fieldErrors, passwordChangeSchema } from "@/lib/validation";

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const EMAIL = "kund@exempelbygg.test";
const ok = { data: {}, error: null };

describe("the password change form", () => {
  const valid = {
    current_password: "Gammalt-lösen-1",
    new_password: "Blå-Katt-47",
    confirm_password: "Blå-Katt-47",
  };
  const errorsFor = (input: typeof valid) => {
    const parsed = passwordChangeSchema.safeParse(input);
    return parsed.success ? {} : fieldErrors(passwordChangeSchema.innerType(), parsed.error);
  };

  it("accepts a new password within the rules, typed twice", () => {
    expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
  });

  it("names each problem under its field", () => {
    expect(errorsFor({ ...valid, current_password: "" })).toEqual({
      current_password: "current_password_required",
    });
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(errorsFor({ ...valid, new_password: short, confirm_password: short })).toEqual({
      new_password: "password_too_short",
    });
    // å takes two bytes, so this is one byte over the limit.
    const long = "å".repeat(MAX_PASSWORD_BYTES / 2) + "a";
    expect(errorsFor({ ...valid, new_password: long, confirm_password: long })).toEqual({
      new_password: "password_too_long",
    });
    expect(errorsFor({ ...valid, confirm_password: "Blå-Katt-48" })).toEqual({
      confirm_password: "password_mismatch",
    });
    expect(
      errorsFor({
        ...valid,
        new_password: valid.current_password,
        confirm_password: valid.current_password,
      }),
    ).toEqual({ new_password: "password_same" });
  });
});

describe("changing the password", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.signInWithPassword.mockResolvedValue(ok);
    auth.updateUser.mockResolvedValue(ok);
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("checks the current password, changes it, then signs out the other devices", async () => {
    await expect(changePassword(EMAIL, "old-pass-1", "new-pass-2")).resolves.toEqual({
      otherSessionsSignedOut: true,
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: "old-pass-1" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-pass-2" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("changes nothing when the current password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    await expect(changePassword(EMAIL, "wrong", "new-pass-2")).rejects.toSatisfy(
      (e) => errorCode(e) === "wrong_current_password",
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("says too_many_attempts when Auth slows the checks down", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Slow down", 429, "over_request_rate_limit"),
    });
    await expect(changePassword(EMAIL, "old", "new-pass-2")).rejects.toSatisfy(
      (e) => errorCode(e) === "too_many_attempts",
    );
  });

  it("passes Auth's refusal of the new password on as a code", async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: new AuthApiError("Same password", 422, "same_password"),
    });
    await expect(changePassword(EMAIL, "old-pass-1", "old-pass-1")).rejects.toSatisfy(
      (e) => errorCode(e) === "same_password",
    );
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(authErrorCode(new AuthApiError("Weak", 422, "weak_password"))).toBe("weak_password");
  });

  it("says so when the password changed but the other devices stayed signed in", async () => {
    auth.signOut.mockResolvedValue({ error: new AuthApiError("Failed", 500, undefined) });
    await expect(changePassword(EMAIL, "old-pass-1", "new-pass-2")).resolves.toEqual({
      otherSessionsSignedOut: false,
    });
  });
});

describe("a session ended elsewhere", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
  });

  it("is gone only when Auth says the session does not exist", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError(
        "Session from session_id claim in JWT does not exist",
        403,
        "session_not_found",
      ),
    });
    await expect(sessionIsGone()).resolves.toBe(true);
  });

  it("is still there when Auth answers, or fails for another reason", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await expect(sessionIsGone()).resolves.toBe(false);
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Internal", 500, "unexpected_failure"),
    });
    await expect(sessionIsGone()).resolves.toBe(false);
  });

  it("asks nothing without a session on this device", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(sessionIsGone()).resolves.toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
