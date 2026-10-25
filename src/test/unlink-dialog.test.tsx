import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { AppError } from "@/lib/errors";
import { formatList } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import type { Candidate, JobWithCount } from "@/types";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const job = (id: string, title: string, status: "open" | "closed"): JobWithCount => ({
  id,
  customer_id: CUSTOMER,
  title,
  location: "Göteborg",
  description: "",
  status,
  created_at: "2026-10-20T08:00:00Z",
  candidate_count: 1,
});

vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: () => ({ data: undefined, isError: false }),
}));
vi.mock("@/hooks/useJobs", () => ({
  useJobs: () => ({
    data: [
      job("j1", "Platschef", "open"),
      job("j2", "Snickare", "closed"),
      job("j3", "Projektledare", "open"),
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useCandidates", () => ({
  useSaveCandidate: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// The candidate is linked to the open Platschef and the closed Snickare.
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => ({
    data: [
      { id: "a1", candidate_id: "c1", job_id: "j1" },
      { id: "a2", candidate_id: "c1", job_id: "j2" },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
}));

const candidate: Candidate = {
  id: "c1",
  customer_id: CUSTOMER,
  full_name: "Alva Provsson",
  email: "alva@exempel.test",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: null,
  created_at: "2026-10-20T08:00:00Z",
};

const onOpenChange = vi.fn();

function openDialog() {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateDialog
        customerId={CUSTOMER}
        open
        onOpenChange={onOpenChange}
        candidate={candidate}
      />
    </I18nextProvider>,
  );
}

const box = (title: string) => screen.getByRole("checkbox", { name: new RegExp(title) });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("removing a candidate's job link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(candidate);
  });

  it("shows the existing links ticked and untickable, also on a closed job", () => {
    openDialog();
    for (const title of ["Platschef", "Snickare"]) {
      expect(box(title)).toBeChecked();
      expect(box(title)).toBeEnabled();
    }
    expect(box("Projektledare")).not.toBeChecked();
    expect(screen.getByText(/Untick a job to remove the candidate's card from it/)).toBeTruthy();
  });

  it("asks first, naming the job, then saves with the link removed", async () => {
    openDialog();
    fireEvent.click(box("Platschef"));
    save();
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Alva Provsson is removed from Platschef. The card on the board goes too, with any CV assessment.",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "c1", newJobIds: [], removedJobIds: ["j1"] }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("keeps every link when the confirm is cancelled", async () => {
    openDialog();
    fireEvent.click(box("Platschef"));
    save();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(box("Platschef")).toBeChecked();
  });

  it("adds and removes links in the same save", async () => {
    openDialog();
    fireEvent.click(box("Snickare"));
    fireEvent.click(box("Projektledare"));
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ newJobIds: ["j3"], removedJobIds: ["j2"] }),
      ),
    );
  });

  it("saves without asking when no link is removed", async () => {
    openDialog();
    fireEvent.click(box("Projektledare"));
    save();
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ newJobIds: ["j3"], removedJobIds: [] }),
      ),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("says the candidate is saved when only removing the links failed", async () => {
    mocks.save.mockRejectedValue(new AppError("unlinks_failed"));
    openDialog();
    fireEvent.click(box("Platschef"));
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "The candidate was saved, but could not be removed from the jobs. Open the candidate and try again.",
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("a list of names", () => {
  it("is joined the way each language does it", () => {
    expect(formatList(["Platschef", "Snickare"], "sv")).toBe("Platschef och Snickare");
    expect(formatList(["A", "B", "C"], "en")).toBe("A, B and C");
  });
});
