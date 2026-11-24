import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMeasuredBackgroundFloor } from "@/hooks/useBranding";

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const PATH = `${CUSTOMER}/background`;

const mocks = vi.hoisted(() => ({
  // The floor the file under PATH measures; a colleague may replace the file meanwhile.
  floor: 0.3,
  download: vi.fn(),
}));

vi.mock(import("@/lib/api/brandingFiles"), async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBrandingFile: mocks.download,
}));
vi.mock("@/lib/prepare-background", () => ({
  measureBackgroundFloor: () => Promise.resolve(mocks.floor),
}));

describe("the floor measured on the settings page", () => {
  beforeEach(() => {
    mocks.floor = 0.3;
    mocks.download.mockReset();
    mocks.download.mockResolvedValue(new Blob());
  });

  it("is measured again each time the page opens, so a replaced image is never judged by the old one", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const open = () => renderHook(() => useMeasuredBackgroundFloor(CUSTOMER, PATH), { wrapper });

    const first = open();
    await waitFor(() => expect(first.result.current.data).toBe(0.3));
    first.unmount();

    // A colleague replaces the image with a darker one, under the same path.
    mocks.floor = 0.6;
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
    const second = open();
    await waitFor(() => expect(second.result.current.data).toBe(0.6));
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
});
