import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateAssessment } from "@/components/pipeline/CandidateAssessment";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import type { Application, Candidate, CvAssessment } from "@/types";

const mocks = vi.hoisted(() => ({
  assess: vi.fn(),
  list: {
    data: [] as CvAssessment[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  pending: { isPending: false, variables: undefined as { applicationId: string } | undefined },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useAssessments", () => ({
  useAssessments: () => mocks.list,
  useAssessCv: () => ({ mutateAsync: mocks.assess, ...mocks.pending }),
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
  cv_path: `${CUSTOMER}/c1.pdf`,
  created_at: "2026-09-21T08:00:00Z",
};
const card = (id: string, jobId: string): Application => ({
  id,
  customer_id: CUSTOMER,
  job_id: jobId,
  candidate_id: "c1",
  stage: "new",
  position: 0,
  stage_changed_at: "2026-10-20T08:00:00Z",
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-20T08:00:00Z",
});
const titles: Record<string, string> = { j1: "UX-designer", j2: "Frontendutvecklare" };
const jobTitle = (a: Application) => titles[a.job_id] ?? "";

function renderBox(options: { cvPath?: string | null; links?: Application[] } = {}) {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateAssessment
        customerId={CUSTOMER}
        candidate={{
          ...candidate,
          cv_path: options.cvPath === undefined ? candidate.cv_path : options.cvPath,
        }}
        links={options.links ?? [card("a1", "j1"), card("a2", "j2")]}
        jobTitle={jobTitle}
      />
    </I18nextProvider>,
  );
}

describe("the AI assessment in the candidate panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.data = [];
    mocks.list.isLoading = false;
    mocks.list.isError = false;
    mocks.pending.isPending = false;
    mocks.pending.variables = undefined;
    mocks.assess.mockResolvedValue(undefined);
  });

  it("is labelled as a suggestion from AI, never a decision", () => {
    renderBox();
    expect(screen.getByRole("region", { name: "AI assessment of the CV" })).toBeTruthy();
    expect(screen.getByText("AI suggestion")).toBeTruthy();
    expect(screen.getByText(/A suggestion from AI to support you, not a decision/)).toBeTruthy();
  });

  it("offers an assessment for each linked job, in the app's language", async () => {
    renderBox();
    expect(screen.getAllByText("Not assessed yet.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Assess CV – Frontendutvecklare" }));
    await waitFor(() =>
      expect(mocks.assess).toHaveBeenCalledWith({ applicationId: "a2", language: "en" }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "The CV is assessed against Frontendutvecklare.",
    );
  });

  it("shows the newest assessment of each job: score, summary, strengths and gaps", () => {
    mocks.list.data = [
      {
        id: "s2",
        application_id: "a1",
        score: 8,
        summary: "Strong match for the role.",
        strengths: ["Eight years of UX"],
        gaps: ["No accessibility audits mentioned"],
        created_at: "2026-10-23T12:00:00Z",
      },
      {
        id: "s1",
        application_id: "a1",
        score: 3,
        summary: "Older assessment.",
        strengths: [],
        gaps: [],
        created_at: "2026-10-20T12:00:00Z",
      },
    ];
    renderBox();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("out of 10")).toBeTruthy();
    expect(screen.getByText("Strong match for the role.")).toBeTruthy();
    expect(screen.queryByText("Older assessment.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Strengths" })).toBeTruthy();
    expect(screen.getByText("No accessibility audits mentioned")).toBeTruthy();
    expect(screen.getByText("Assessed 23 Oct 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assess again – UX-designer" })).toBeTruthy();
    expect(screen.getAllByText("Not assessed yet.")).toHaveLength(1);
  });

  it("cannot assess without a CV, and says why", () => {
    renderBox({ cvPath: null });
    expect(screen.getByText("Upload a CV above to assess it.")).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: /^Assess CV – / })) {
      expect(button).toBeDisabled();
    }
  });

  it("asks for a job link when the candidate has none", () => {
    renderBox({ links: [] });
    expect(
      screen.getByText("Link the candidate to a job to assess the CV against it."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Assess/ })).toBeNull();
  });

  it("shows which assessment is running, and blocks a second one meanwhile", () => {
    mocks.pending.isPending = true;
    mocks.pending.variables = { applicationId: "a1" };
    renderBox();
    const running = screen.getByRole("button", { name: "Assessing… – UX-designer" });
    expect(running).toHaveTextContent("Assessing…");
    expect(running).toBeDisabled();
    expect(screen.getByRole("button", { name: "Assess CV – Frontendutvecklare" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("This can take up to half a minute.");
  });

  it("says why an assessment failed", async () => {
    mocks.assess.mockRejectedValue(new AppError("cv_no_text"));
    renderBox();
    fireEvent.click(screen.getByRole("button", { name: "Assess CV – UX-designer" }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Could not assess the CV.", {
        description: "The CV has no text to assess. Is it a scanned image? Upload a PDF with text.",
      }),
    );
  });

  it("has a loading and an error state", () => {
    mocks.list.isLoading = true;
    renderBox();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("offers a retry when the assessments cannot be loaded", () => {
    mocks.list.isError = true;
    renderBox();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    expect(mocks.list.refetch).toHaveBeenCalled();
  });
});
