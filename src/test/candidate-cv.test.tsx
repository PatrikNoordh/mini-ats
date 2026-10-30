import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateCv } from "@/components/pipeline/CandidateCv";
import { MAX_CV_BYTES } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import type { Candidate } from "@/types";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  url: { data: undefined as string | undefined, isError: false, error: null, refetch: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: () => mocks.url,
  useUploadCv: () => ({ mutateAsync: mocks.upload, isPending: false }),
  useRemoveCv: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const candidate: Candidate = {
  id: "c1",
  customer_id: CUSTOMER,
  full_name: "Max Demo",
  email: "max@exempel.test",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: null,
  cv_uploaded_at: null,
  created_at: "2026-09-21T08:00:00Z",
};

function renderCv(cvPath: string | null = null) {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <dl>
        <CandidateCv customerId={CUSTOMER} candidate={{ ...candidate, cv_path: cvPath }} />
      </dl>
    </I18nextProvider>,
  );
}

/** Chooses a file in the hidden input, the way the browser does after the button opens it. */
function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Choose a PDF file as the CV for Max Demo"), {
    target: { files: [file] },
  });
}

describe("the CV in the candidate panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.url.data = undefined;
    mocks.upload.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
  });

  it("offers an upload, and says which files are allowed", () => {
    renderCv();
    expect(screen.getByText("No CV uploaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload CV" })).toBeTruthy();
    expect(screen.getByText("PDF, at most 5 MB.")).toBeTruthy();
  });

  it("uploads a PDF for the candidate", async () => {
    renderCv();
    const file = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });
    choose(file);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith({ candidateId: "c1", file }));
    expect(mocks.toast.success).toHaveBeenCalledWith("The CV has been uploaded.");
  });

  it("refuses another type or a file over the limit before uploading", () => {
    renderCv();
    choose(new File(["x"], "cv.docx", { type: "application/msword" }));
    const big = new File(["x"], "cv.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_CV_BYTES + 1 });
    choose(big);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenNthCalledWith(1, "Could not upload the CV.", {
      description: "The CV must be a PDF file.",
    });
    expect(mocks.toast.error).toHaveBeenNthCalledWith(2, "Could not upload the CV.", {
      description: "The CV can be at most 5 MB.",
    });
  });

  it("opens the CV through the short-lived link in a new tab", () => {
    mocks.url.data = "https://storage.test/signed/cv.pdf?token=t";
    renderCv(`${CUSTOMER}/c1.pdf`);
    const link = screen.getByRole("link", { name: "Open CV" });
    expect(link.getAttribute("href")).toBe(mocks.url.data);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("button", { name: "Replace CV" })).toBeTruthy();
  });

  it("asks before it removes the CV", async () => {
    renderCv(`${CUSTOMER}/c1.pdf`);
    fireEvent.click(screen.getByRole("button", { name: "Remove CV" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("The CV for Max Demo will be deleted for good.");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove CV" }).at(-1)!);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("c1"));
    expect(mocks.toast.success).toHaveBeenCalledWith("The CV has been removed.");
  });
});
