import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { AuthUser } from "@/lib/api/auth";
import { queryKeys } from "@/lib/stages";
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

function profileOf(id: string, companyId: string): Profile {
  return {
    id,
    role: "customer",
    full_name: id,
    company_id: companyId,
    email: `${id}@test.local`,
    created_at: "2026-10-01T00:00:00Z",
    deleted_at: null,
  };
}

const profiles: Record<string, Profile> = {
  a: profileOf("a", "company-a"),
  b: profileOf("b", "company-b"),
};

/** The provider with a fresh cache, and the auth callback, to sign users in and out from Auth. */
function renderAuth() {
  let authChange: (user: AuthUser | null) => void = () => {};
  api.onAuthUserChange.mockImplementation((onChange: typeof authChange) => {
    authChange = onChange;
    onChange(null);
    return () => {};
  });
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useAuth(), { wrapper });
  const signInAs = async (id: string) => {
    act(() => authChange({ id, email: `${id}@test.local` }));
    await waitFor(() => expect(view.result.current.user?.id).toBe(id));
  };
  return { ...view, queryClient, signInAs };
}

describe("the query cache when the signed-in user changes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getProfile.mockImplementation((id: string) => Promise.resolve(profiles[id] ?? null));
    api.signOut.mockResolvedValue(undefined);
    api.sessionIsGone.mockResolvedValue(false);
  });

  it("is emptied when another user signs in, and kept for the same user", async () => {
    const { queryClient, signInAs } = renderAuth();
    await signInAs("a");
    queryClient.setQueryData(queryKeys.jobs("company-a"), [{ id: "job-a" }]);

    // A token refresh reports the same user again: the cache stays.
    await signInAs("a");
    expect(queryClient.getQueryData(queryKeys.jobs("company-a"))).toEqual([{ id: "job-a" }]);

    await signInAs("b");
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("is emptied on sign-out", async () => {
    const { result, queryClient, signInAs } = renderAuth();
    await signInAs("a");
    queryClient.setQueryData(queryKeys.jobs("company-a"), [{ id: "job-a" }]);

    await act(() => result.current.signOut());

    expect(result.current.user).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });
});
