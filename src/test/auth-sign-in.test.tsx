import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { Profile } from "@/types";

const api = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthUserChange: vi.fn(),
  sessionIsGone: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  signInWithPassword: api.signInWithPassword,
  signOut: api.signOut,
  onAuthUserChange: api.onAuthUserChange,
  sessionIsGone: api.sessionIsGone,
}));
vi.mock("@/lib/api/profiles", () => ({ getProfile: api.getProfile }));

const user = { id: "u1", email: "anna@test.local" };
const profile: Profile = {
  id: "u1",
  role: "customer",
  full_name: "Anna",
  company_name: "Nordkust",
  email: "anna@test.local",
  created_at: "2026-10-01T00:00:00Z",
  deleted_at: null,
};

function renderAuth() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}

describe("sign-in", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Signed out when the page loads.
    api.onAuthUserChange.mockImplementation((onChange: (u: null) => void) => {
      onChange(null);
      return () => {};
    });
    api.signInWithPassword.mockResolvedValue(user);
    api.signOut.mockResolvedValue(undefined);
    api.sessionIsGone.mockResolvedValue(false);
  });

  it("signs in with the profile and keeps the session", async () => {
    api.getProfile.mockResolvedValue(profile);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.signIn("anna@test.local", "secret-pass"));

    expect(result.current.profile).toEqual(profile);
    expect(api.signOut).not.toHaveBeenCalled();
  });

  it("signs out again when the profile fails to load", async () => {
    const offline = new TypeError("Failed to fetch");
    api.getProfile.mockRejectedValue(offline);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() =>
      expect(result.current.signIn("anna@test.local", "secret-pass")).rejects.toBe(offline),
    );

    expect(api.signOut).toHaveBeenCalledOnce();
    expect(result.current.user).toBeNull();
  });

  it("signs out again when there is no profile", async () => {
    api.getProfile.mockResolvedValue(null);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() =>
      expect(result.current.signIn("anna@test.local", "secret-pass")).rejects.toMatchObject({
        code: "profile_not_found",
      }),
    );

    expect(api.signOut).toHaveBeenCalledOnce();
    expect(result.current.user).toBeNull();
  });
});

describe("a session ended on another device", () => {
  /** Signed in when the page loads, as on a second device after a password change elsewhere. */
  function signedInOnLoad() {
    api.onAuthUserChange.mockImplementation((onChange: (u: typeof user) => void) => {
      onChange(user);
      return () => {};
    });
  }

  function showTab() {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    vi.resetAllMocks();
    signedInOnLoad();
    api.getProfile.mockResolvedValue(profile);
    api.signOut.mockResolvedValue(undefined);
  });

  it("signs out on this device when Auth says the session is gone", async () => {
    api.sessionIsGone.mockResolvedValue(true);
    const { result } = renderAuth();
    await waitFor(() => expect(api.signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.user).toBeNull());
  });

  it("checks again when the tab is shown, and stays signed in while the session lives", async () => {
    api.sessionIsGone.mockResolvedValue(false);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.profile).toEqual(profile));
    await waitFor(() => expect(api.sessionIsGone).toHaveBeenCalledOnce());

    api.sessionIsGone.mockResolvedValue(true);
    act(() => showTab());
    await waitFor(() => expect(api.signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.user).toBeNull());
  });

  it("stays signed in when the check itself fails, for example offline", async () => {
    api.sessionIsGone.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderAuth();
    await waitFor(() => expect(api.sessionIsGone).toHaveBeenCalled());
    expect(api.signOut).not.toHaveBeenCalled();
    expect(result.current.profile).toEqual(profile);
  });
});
