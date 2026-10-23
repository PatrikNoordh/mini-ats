import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateSheet } from "@/components/pipeline/CandidateSheet";
import { getI18n } from "@/lib/i18n";
import type { Application, Candidate, Job } from "@/types";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useApplications", () => ({
  useAddApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveApplication: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));
vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: () => ({ data: undefined, isError: false }),
  useUploadCv: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveCv: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const job = (id: string, title: string): Job => ({
  id,
  customer_id: CUSTOMER,
  title,
  location: "Stockholm",
  description: "",
  status: "open",
  created_at: "2026-10-01T08:00:00Z",
});
const card = (id: string, jobId: string, stage: Application["stage"]): Application => ({
  id,
  customer_id: CUSTOMER,
  job_id: jobId,
  candidate_id: "c1",
  stage,
  position: 0,
  stage_changed_at: "2026-10-20T08:00:00Z",
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-20T08:00:00Z",
});
const candidate: Candidate = {
  id: "c1",
  customer_id: CUSTOMER,
  full_name: "Max Demo",
  email: "max@exempel.test",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: null,
  created_at: "2026-09-21T08:00:00Z",
};

function openSheet() {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateSheet
        customerId={CUSTOMER}
        candidate={candidate}
        applications={[card("a1", "j1", "hired"), card("a2", "j2", "new")]}
        jobs={[job("j1", "Frontendutvecklare"), job("j2", "UX-designer")]}
        onClose={vi.fn()}
      />
    </I18nextProvider>,
  );
}

describe("removing a card from the candidate panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.remove.mockResolvedValue(undefined);
  });

  it("has a labelled remove button on each linked job", () => {
    openSheet();
    expect(screen.getByRole("button", { name: "Remove from Frontendutvecklare" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from UX-designer" })).toBeTruthy();
  });

  it("asks first, naming the job, then removes only that card", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Remove from UX-designer" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Max Demo is removed from UX-designer. The card on the board goes too, with any CV assessment. The candidate is kept.",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({ candidateId: "c1", jobId: "j2" }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "The candidate has been removed from UX-designer.",
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("removes nothing when the confirm is cancelled", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Remove from UX-designer" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("says why when the removal fails", async () => {
    mocks.remove.mockRejectedValue(new Error("network"));
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Frontendutvecklare" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Could not remove the candidate from the job.",
        expect.anything(),
      ),
    );
  });
});
