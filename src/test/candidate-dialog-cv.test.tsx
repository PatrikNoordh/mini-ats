import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { MAX_CV_BYTES } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import type { Candidate } from "@/types";

const SIGNED_URL = "https://storage.test/signed/cv.pdf?token=t";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  // The state of the signed link: made, still loading, or failed.
  cvUrl: { state: "ready" as "ready" | "loading" | "failed" },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: (_customerId: string, path: string | null) => ({
    data: path && mocks.cvUrl.state === "ready" ? SIGNED_URL : undefined,
    isError: mocks.cvUrl.state === "failed",
    error: mocks.cvUrl.state === "failed" ? new AppError("cv_not_found") : null,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/hooks/useJobs", () => ({
  useJobs: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => ({ data: [], isLoading: false, isError: false, isSuccess: true }),
}));
vi.mock("@/hooks/useCandidates", () => ({
  useSaveCandidate: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const candidate: Candidate = {
  id: "c1",
  customer_id: CUSTOMER,
  full_name: "Alva Provsson",
  email: "alva@exempel.test",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: `${CUSTOMER}/c1.pdf`,
  cv_uploaded_at: "2026-10-20T08:00:00Z",
  created_at: "2026-10-20T08:00:00Z",
};
const pdf = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });
const onOpenChange = vi.fn();

function openDialog(existing: Candidate | null) {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateDialog
        customerId={CUSTOMER}
        open
        onOpenChange={onOpenChange}
        candidate={existing}
      />
    </I18nextProvider>,
  );
}

const cvInput = () => screen.getByLabelText("CV (PDF)");
const choose = (file: File) => fireEvent.change(cvInput(), { target: { files: [file] } });

function fillNewCandidate() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test Testsson" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@exempel.test" } });
}

describe("a CV in the candidate dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(candidate);
    mocks.cvUrl.state = "ready";
  });

  it("uploads the chosen CV with a new candidate", async () => {
    openDialog(null);
    expect(screen.getByText("Optional. PDF, at most 5 MB.")).toBeTruthy();
    expect(screen.getByText("No CV uploaded.")).toBeTruthy();
    expect(screen.queryByText("Ingen fil har valts")).toBeNull();
    fillNewCandidate();
    choose(pdf);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ cvFile: pdf })),
    );
  });

  it("shows the current CV with a link to open it, and says a new file replaces it", () => {
    openDialog(candidate);
    expect(screen.getByText("Current CV")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(SIGNED_URL);
    expect(screen.getByText("Replace CV")).toBeTruthy();
    choose(pdf);
    expect(screen.getByText("Chosen file: cv.pdf")).toBeTruthy();
    expect(screen.getByText("The new file replaces the current CV when you save.")).toBeTruthy();
  });

  it("shows Open as disabled while the link to the CV is made", () => {
    mocks.cvUrl.state = "loading";
    openDialog(candidate);
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open" }).hasAttribute("disabled")).toBe(true);
  });

  it("says why the CV can't be opened, with a retry", () => {
    mocks.cvUrl.state = "failed";
    openDialog(candidate);
    expect(screen.getByRole("alert").textContent).toContain("Could not fetch the CV.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("can undo the chosen file before saving", async () => {
    openDialog(candidate);
    choose(pdf);
    fireEvent.click(screen.getByRole("button", { name: "Undo choice" }));
    expect(screen.queryByText("Chosen file: cv.pdf")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ cvFile: null })),
    );
  });

  it("shows why a file is refused under the field, and saves nothing", () => {
    openDialog(null);
    fillNewCandidate();
    const big = new File(["x"], "cv.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_CV_BYTES + 1 });
    choose(big);
    expect(screen.getByText("The CV can be at most 5 MB.")).toBeTruthy();
    expect(cvInput().getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("closes and says so when the candidate is saved but the CV upload fails", async () => {
    mocks.save.mockRejectedValue(new AppError("cv_upload_failed"));
    openDialog(null);
    fillNewCandidate();
    choose(pdf);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "The candidate was saved, but the CV could not be uploaded. Open the candidate and try again.",
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
