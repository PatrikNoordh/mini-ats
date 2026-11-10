import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyCard } from "@/components/accounts/CompanyCard";
import { DeletedCompanies } from "@/components/accounts/DeletedCompanies";
import { getI18n } from "@/lib/i18n";
import type { Company, Profile } from "@/types";

const m = vi.hoisted(() => ({
  remove: vi.fn(),
  restore: vi.fn(),
  deleteNow: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: m.toast }));
const mutation = (fn: ReturnType<typeof vi.fn>) => ({
  mutateAsync: fn,
  isPending: false,
  variables: undefined,
});
vi.mock("@/hooks/useCompanies", () => ({
  useDeleteCompany: () => mutation(m.remove),
  useRestoreCompany: () => mutation(m.restore),
  useDeleteCompanyNow: () => mutation(m.deleteNow),
}));

const lumen: Company = {
  id: "co1",
  name: "Lumen AB",
  created_at: "2026-10-01T08:00:00Z",
  deleted_at: null,
};
const member: Profile = {
  id: "u1",
  role: "customer",
  full_name: "Karin Exempel",
  company_id: "co1",
  company_name: "Lumen AB",
  email: "karin@lumen.test",
  created_at: "2026-10-01T08:00:00Z",
  deleted_at: null,
};

const inEnglish = (ui: ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);

function card(members: Profile[]) {
  const handlers = { onRename: vi.fn(), onAddUser: vi.fn(), onEdit: vi.fn() };
  inEnglish(<CompanyCard company={lumen} members={members} {...handlers} />);
  return handlers;
}

describe("a company on the accounts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists its users, each one opening the account", () => {
    const { onEdit } = card([member]);
    const region = screen.getByRole("region", { name: "Lumen AB" });
    expect(region).toHaveTextContent("1 user");
    fireEvent.click(within(region).getByRole("button", { name: "Edit Karin Exempel" }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  it("is marked as having no users, and keeps its data", () => {
    card([]);
    expect(screen.getByText("No users")).toBeInTheDocument();
    expect(screen.getByText(/The company keeps all its data/)).toBeInTheDocument();
  });

  it("adds a user and renames from its own buttons", () => {
    const { onRename, onAddUser } = card([member]);
    fireEvent.click(screen.getByRole("button", { name: "Add a user to Lumen AB" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Lumen AB" }));
    expect(onAddUser).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledOnce();
  });

  it("is deleted after a confirm that names the date and what goes with it", async () => {
    m.remove.mockResolvedValue(undefined);
    card([member]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Lumen AB" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/deleted for good on \d+ \w+ \d{4}/);
    expect(confirm).toHaveTextContent("its users' accounts");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m.remove).toHaveBeenCalledWith("co1"));
    expect(m.toast.success).toHaveBeenCalledWith(
      "The company is deleted. You can restore it under Deleted companies.",
    );
  });
});

describe("deleted companies", () => {
  const gone: Company = { ...lumen, deleted_at: "2026-10-22T10:00:00Z" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows each company with its users and the date it is deleted for good, and restores it", async () => {
    m.restore.mockResolvedValue(undefined);
    inEnglish(<DeletedCompanies companies={[gone]} memberCounts={new Map([["co1", 2]])} />);
    expect(screen.getAllByText("Deleted for good on 21 Nov 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 users").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(m.restore).toHaveBeenCalledWith("co1"));
  });

  it("deletes for good only after the company's name is typed", async () => {
    m.deleteNow.mockResolvedValue(undefined);
    inEnglish(<DeletedCompanies companies={[gone]} memberCounts={new Map()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    const confirm = await screen.findByRole("alertdialog");
    const button = within(confirm).getByRole("button", { name: "Delete for good" });
    const input = within(confirm).getByLabelText("Type Lumen AB to confirm.");
    fireEvent.change(input, { target: { value: "Lumen" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "Lumen AB" } });
    fireEvent.click(button);
    await waitFor(() => expect(m.deleteNow).toHaveBeenCalledWith("co1"));
  });

  it("has an empty state", () => {
    inEnglish(<DeletedCompanies companies={[]} memberCounts={new Map()} />);
    expect(screen.getByText("No deleted companies")).toBeInTheDocument();
  });
});
