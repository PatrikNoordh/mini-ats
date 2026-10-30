import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useRemoveCv } from "@/hooks/useCvs";
import { queryKeys } from "@/lib/stages";

vi.mock("@/lib/candidate-cv", () => ({
  removeCandidateCv: () => Promise.resolve(),
  uploadCandidateCv: () => Promise.resolve(),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";

describe("removing a CV", () => {
  it("refreshes the candidate's assessments, which the database removes with the CV", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRemoveCv(CUSTOMER), { wrapper });

    await act(() => result.current.mutateAsync("c1"));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assessmentsAll(CUSTOMER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.candidates(CUSTOMER) });
  });
});
