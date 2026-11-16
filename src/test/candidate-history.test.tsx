import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateSheet } from "@/components/pipeline/CandidateSheet";
import { HISTORY_LIMIT } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import type { AuditActor, AuditEvent, Candidate, Job } from "@/types";
import { DEFAULT_TEST_STAGES, TEST_CUSTOMER, stageId } from "./stage-fixtures";

const m = vi.hoisted(() => ({
  history: {} as {
    data: { events: AuditEvent[]; actors: Map<string, AuditActor> } | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: ReturnType<typeof vi.fn>;
  },
  useCandidateHistory: vi.fn(),
}));

vi.mock("@/hooks/useHistory", () => ({ useCandidateHistory: m.useCandidateHistory }));
vi.mock("@/hooks/useApplications", () => ({
  useAddApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useAssessments", () => ({
  useAssessments: () => ({ data: [], isLoading: false, isError: false }),
  useAssessCv: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useCvs", () => ({
  useCvUrl: () => ({ data: undefined, isError: false }),
  useUploadCv: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveCv: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const job: Job = {
  id: "j1",
  customer_id: TEST_CUSTOMER,
  title: "Snickare",
  location: "",
  description: "",
  status: "open",
  created_at: "2026-10-01T08:00:00Z",
};
const candidate: Candidate = {
  id: "c1",
  customer_id: TEST_CUSTOMER,
  full_name: "Anna Berg",
  email: "",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: null,
  cv_uploaded_at: null,
  created_at: "2026-10-01T08:00:00Z",
};
const card = { job_id: "j1", candidate_id: "c1", stage_id: stageId("new") };

function event(id: number, extra: Partial<AuditEvent>): AuditEvent {
  return {
    id,
    customer_id: TEST_CUSTOMER,
    actor_id: "member",
    action: "insert",
    table_name: "applications",
    row_id: "card",
    candidate_id: "c1",
    fields: null,
    before: null,
    after: card,
    created_at: "2026-11-16T10:00:00Z",
    ...extra,
  };
}

const actors = new Map<string, AuditActor>([
  ["member", { id: "member", full_name: "Cecilia", is_admin: false }],
  ["admin", { id: "admin", full_name: null, is_admin: true }],
]);

function openHistory() {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateSheet
        customerId={TEST_CUSTOMER}
        candidate={candidate}
        applications={[]}
        jobs={[job]}
        stages={DEFAULT_TEST_STAGES}
        onClose={vi.fn()}
      />
    </I18nextProvider>,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
}

describe("the history tab in the candidate panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.history = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    m.useCandidateHistory.mockImplementation(() => m.history);
  });

  it("opens on the details, and loads the history only when its tab is chosen", () => {
    render(
      <I18nextProvider i18n={getI18n("en")}>
        <CandidateSheet
          customerId={TEST_CUSTOMER}
          candidate={candidate}
          applications={[]}
          jobs={[job]}
          stages={DEFAULT_TEST_STAGES}
          onClose={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(m.useCandidateHistory).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }));
    expect(m.useCandidateHistory).toHaveBeenCalledWith(TEST_CUSTOMER, "c1");
  });

  it("lists the stage moves, edits and job links newest first, each with who made it", () => {
    m.history.data = {
      events: [
        event(3, {
          action: "update",
          actor_id: "admin",
          fields: ["stage_id"],
          before: card,
          after: { ...card, stage_id: stageId("interview") },
        }),
        event(2, {
          table_name: "candidates",
          row_id: "c1",
          fields: ["email"],
          action: "update",
          after: null,
        }),
        event(1, { actor_id: "purged" }),
      ],
      actors,
    };
    openHistory();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Moved Anna Berg from New to Interview in Snickare",
      "Changed email for Anna Berg",
      "Linked Anna Berg to Snickare",
    ]);
    expect(items[0]).toHaveTextContent("by Admin");
    expect(items[1]).toHaveTextContent("by Cecilia");
    expect(items[2]).toHaveTextContent("by A removed user");
    expect(items[0]?.querySelector("time")).toHaveAttribute("datetime", "2026-11-16T10:00:00Z");
  });

  it("shows a loading state while the history loads", () => {
    m.history.isLoading = true;
    openHistory();
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("says when there is no history yet", () => {
    m.history.data = { events: [], actors: new Map() };
    openHistory();
    expect(screen.getByText("No history yet")).toBeInTheDocument();
  });

  it("offers a retry when the history cannot be loaded", () => {
    m.history.isError = true;
    openHistory();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(m.history.refetch).toHaveBeenCalled();
  });

  it("says when the list stops at the limit", () => {
    m.history.data = {
      events: Array.from({ length: HISTORY_LIMIT }, (_, i) => event(HISTORY_LIMIT - i, {})),
      actors,
    };
    openHistory();
    expect(screen.getByText(`Showing the latest ${HISTORY_LIMIT} events.`)).toBeInTheDocument();
  });
});
