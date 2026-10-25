import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { JobDialog } from "@/components/jobs/JobDialog";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import type { Candidate, JobWithCount } from "@/types";

const mocks = vi.hoisted(() => ({
  deleteJob: vi.fn(),
  deleteCandidate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const idle = { mutateAsync: vi.fn(), isPending: false };
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: () => ({ data: undefined, isError: false }),
}));
vi.mock("@/hooks/useJobs", () => ({
  useCreateJob: () => idle,
  useUpdateJob: () => idle,
  useDeleteJob: () => ({ mutateAsync: mocks.deleteJob, isPending: false }),
  useJobs: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useCandidates", () => ({
  useSaveCandidate: () => idle,
  useDeleteCandidate: () => ({ mutateAsync: mocks.deleteCandidate, isPending: false }),
}));
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

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const job = (candidate_count: number): JobWithCount => ({
  id: "j1",
  customer_id: CUSTOMER,
  title: "Platschef",
  location: "Göteborg",
  description: "",
  status: "open",
  created_at: "2026-10-20T08:00:00Z",
  candidate_count,
});
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
const inEnglish = (ui: React.ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);

describe("deleting a job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a job with candidates with a toast, before asking", () => {
    inEnglish(<JobDialog customerId={CUSTOMER} open onOpenChange={onOpenChange} job={job(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Remove them under Candidates first"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.deleteJob).not.toHaveBeenCalled();
  });

  it("asks, then deletes a job without candidates and closes", async () => {
    mocks.deleteJob.mockResolvedValue(undefined);
    inEnglish(<JobDialog customerId={CUSTOMER} open onOpenChange={onOpenChange} job={job(0)} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("“Platschef” will be deleted for good.");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(mocks.deleteJob).toHaveBeenCalledWith("j1"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.success).toHaveBeenCalledWith("The job is deleted.");
  });

  it("shows the refusal when the count on screen was out of date", async () => {
    mocks.deleteJob.mockRejectedValue(new AppError("job_has_candidates"));
    inEnglish(<JobDialog customerId={CUSTOMER} open onOpenChange={onOpenChange} job={job(0)} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Could not delete the job.", {
        description: expect.stringContaining("Remove them under Candidates first"),
      }),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("has no delete button for a new job", () => {
    inEnglish(<JobDialog customerId={CUSTOMER} open onOpenChange={onOpenChange} job={null} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

describe("deleting a candidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the candidate and their jobs, then deletes", async () => {
    mocks.deleteCandidate.mockResolvedValue(undefined);
    inEnglish(
      <CandidateDialog
        customerId={CUSTOMER}
        open
        onOpenChange={onOpenChange}
        candidate={candidate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Alva Provsson will be deleted for good, with their CV and all their cards on the board. The candidate is linked to 2 jobs.",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(mocks.deleteCandidate).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.success).toHaveBeenCalledWith("The candidate is deleted.");
  });

  it("keeps the dialog open and shows the error when the delete fails", async () => {
    mocks.deleteCandidate.mockRejectedValue(new TypeError("Failed to fetch"));
    inEnglish(
      <CandidateDialog
        customerId={CUSTOMER}
        open
        onOpenChange={onOpenChange}
        candidate={candidate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
