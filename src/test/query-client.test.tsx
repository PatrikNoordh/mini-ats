import {
  MutationObserver,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobDialog } from "@/components/jobs/JobDialog";
import { getI18n } from "@/lib/i18n";
import { createQueryClient } from "@/lib/query-client";

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/api/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/jobs")>()),
  createJob: mocks.createJob,
}));

/** What fetch does offline. */
const offlineError = () => new TypeError("Failed to fetch");

describe("the app's query client while offline", () => {
  beforeEach(() => onlineManager.setOnline(false));
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("runs a mutation at once, so it rejects instead of staying paused", async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: () => Promise.reject(offlineError()),
    });
    await expect(observer.mutate()).rejects.toThrow("Failed to fetch");
    expect(observer.getCurrentResult().isPaused).toBe(false);
  });

  it("differs from TanStack's default, which pauses the same mutation", async () => {
    const observer = new MutationObserver(new QueryClient(), {
      mutationFn: () => Promise.reject(offlineError()),
    });
    void observer.mutate().catch(() => {});
    await waitFor(() => expect(observer.getCurrentResult().isPaused).toBe(true));
  });

  it("still pauses queries until the network is back", async () => {
    const qc = createQueryClient();
    qc.mount(); // As QueryClientProvider does: resumes paused work when the network is back.
    const queryFn = vi.fn().mockResolvedValue("data");
    void qc.prefetchQuery({ queryKey: ["probe"], queryFn });
    await waitFor(() => expect(qc.getQueryState(["probe"])?.fetchStatus).toBe("paused"));
    expect(queryFn).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    await waitFor(() => expect(qc.getQueryData(["probe"])).toBe("data"));
    qc.unmount();
  });

  it("shows the job form's error at once and keeps the dialog and the input", async () => {
    mocks.createJob.mockRejectedValue(offlineError());
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onOpenChange = vi.fn();
    render(
      <I18nextProvider i18n={getI18n("en")}>
        <QueryClientProvider client={createQueryClient()}>
          <JobDialog customerId="c1" open onOpenChange={onOpenChange} job={null} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Platschef" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Göteborg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Could not save the job.", {
        description: "No internet connection. Check your network and try again.",
      }),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("Platschef");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
