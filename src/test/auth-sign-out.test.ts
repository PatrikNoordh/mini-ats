import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/lib/api/auth";

const auth = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const offline = { error: new AuthRetryableFetchError("Failed to fetch", 0) };

describe("sign-out", () => {
  beforeEach(() => vi.resetAllMocks());

  it("signs out on this device only", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("counts as done when the request fails but the local session is gone", async () => {
    auth.signOut.mockResolvedValue(offline);
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it("fails when this device is still signed in", async () => {
    auth.signOut.mockResolvedValue(offline);
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    await expect(signOut()).rejects.toBe(offline.error);
  });
});
