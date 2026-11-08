import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { getI18n } from "@/lib/i18n";
import type { Candidate } from "@/types";

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const anna: Candidate = {
  id: "c1",
  customer_id: CUSTOMER,
  full_name: "Anna Svensson",
  email: "anna@firma.test",
  phone: "",
  linkedin_url: "",
  notes: "",
  cv_path: null,
  cv_uploaded_at: null,
  created_at: "2026-11-01T08:00:00Z",
};

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  // The customer id the candidate list was asked for: null while it is not needed.
  listedFor: [] as (string | null)[],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useCvs", () => ({ useCvUrl: () => ({ data: undefined, isError: false }) }));
vi.mock("@/hooks/useJobs", () => ({
  useJobs: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => ({ data: [], isLoading: false, isError: false, isSuccess: true }),
}));
vi.mock("@/hooks/useCandidates", () => ({
  useCandidates: (customerId: string | null) => {
    mocks.listedFor.push(customerId);
    return { data: customerId ? [anna] : undefined };
  },
  useSaveCandidate: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function openDialog(existing: Candidate | null) {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <CandidateDialog customerId={CUSTOMER} open onOpenChange={vi.fn()} candidate={existing} />
    </I18nextProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("a likely duplicate in the candidate dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listedFor = [];
    mocks.save.mockResolvedValue(undefined);
  });

  it("warns about the same email while typing, and still saves", async () => {
    openDialog(null);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    type("Name", "A. Svensson");
    type("Email", "ANNA@firma.test");
    expect(screen.getByRole("status")).toHaveTextContent(
      "A candidate with this email already exists: Anna Svensson. You can still save.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  });

  it("warns about the same name, and the warning goes when the name changes", () => {
    openDialog(null);
    type("Name", "  anna  svensson ");
    expect(screen.getByRole("status")).toHaveTextContent(
      "A candidate named Anna Svensson already exists.",
    );
    type("Name", "Anna Svensson Ek");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("checks only for a new candidate, with the active customer's list", () => {
    openDialog(anna);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(mocks.listedFor.every((id) => id === null)).toBe(true);
  });

  it("asks for the list of the dialog's customer when adding", () => {
    openDialog(null);
    expect(mocks.listedFor).toContain(CUSTOMER);
  });
});
