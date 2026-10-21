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
  getProfile: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  signInWithPassword: api.signInWithPassword,
  signOut: api.signOut,
  onAuthUserChange: api.onAuthUserChange,
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
