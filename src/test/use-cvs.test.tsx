import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCandidates } from "@/hooks/useCandidates";
import { useCvUrl, useRemoveCv } from "@/hooks/useCvs";
import { AppError } from "@/lib/errors";
import { queryKeys } from "@/lib/stages";

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const PATH = `${CUSTOMER}/c1.pdf`;

const mocks = vi.hoisted(() => ({
  // The candidate's cv_path in the database, which the list reads after a delay like a request.
  cvPath: null as string | null,
  signedUrl: vi.fn(),
}));

vi.mock("@/lib/candidate-cv", () => ({
  removeCandidateCv: () => {
    mocks.cvPath = null;
    return Promise.resolve();
  },
  uploadCandidateCv: () => Promise.resolve(),
}));
vi.mock("@/lib/api/cvs", () => ({ cvSignedUrl: mocks.signedUrl }));
vi.mock("@/lib/api/candidates", () => ({
  listCandidates: () =>
    new Promise((resolve) => setTimeout(() => resolve([{ id: "c1", cv_path: mocks.cvPath }]), 10)),
}));
vi.mock("@/lib/save-candidate", () => ({ saveCandidate: vi.fn() }));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // The panel: the candidate from the list, the link to its CV, and the remove button.
  const { result } = renderHook(
    () => {
      const candidates = useCandidates(CUSTOMER);
      const path = candidates.data?.[0]?.cv_path ?? null;
      return { path, url: useCvUrl(CUSTOMER, path), remove: useRemoveCv(CUSTOMER) };
    },
    { wrapper },
  );
  return { result, invalidate };
}

describe("removing a CV", () => {
  beforeEach(() => {
    mocks.cvPath = PATH;
    mocks.signedUrl.mockReset();
    // The file is there for the first link and gone after the remove.
    mocks.signedUrl
      .mockResolvedValueOnce("https://storage.test/signed")
      .mockRejectedValue(new AppError("cv_not_found"));
  });

  it("refreshes the candidate's assessments, which the database removes with the CV", async () => {
    const { result, invalidate } = setup();
    await waitFor(() => expect(result.current.url.data).toBeTruthy());

    await act(() => result.current.remove.mutateAsync("c1"));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assessmentsAll(CUSTOMER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.candidates(CUSTOMER) });
  });

  it("never asks for a link to the removed file, so no error flashes before the CV is gone", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.url.data).toBeTruthy());

    await act(() => result.current.remove.mutateAsync("c1"));
    await waitFor(() => expect(result.current.path).toBeNull());

    expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
    expect(result.current.url.isError).toBe(false);
  });
});
