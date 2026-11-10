import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDialog } from "@/components/accounts/AccountDialog";
import { DeletedAccounts } from "@/components/accounts/DeletedAccounts";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import type { Company, Profile } from "@/types";

const m = vi.hoisted(() => ({
  me: { id: "admin" },
  profiles: [] as Profile[],
  companies: [] as Company[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  deleteNow: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: m.me }) }));
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false });
vi.mock("@/hooks/useProfiles", () => ({
  useProfiles: () => ({ data: m.profiles }),
  useCreateProfile: () => mutation(m.create),
  useUpdateProfile: () => mutation(m.update),
  useDeleteProfile: () => mutation(m.remove),
  useRestoreProfile: () => ({ ...mutation(m.restore), variables: undefined }),
  useDeleteProfileNow: () => mutation(m.deleteNow),
}));
vi.mock("@/hooks/useCompanies", () => ({ useCompanies: () => ({ data: m.companies }) }));

const lumen: Company = {
  id: "co1",
  name: "Lumen AB",
  created_at: "2026-10-01T08:00:00Z",
  deleted_at: null,
};

function account(id: string, role: Profile["role"], extra: Partial<Profile> = {}): Profile {
  return {
    id,
    role,
    full_name: "Erik Exempel",
    company_id: role === "customer" ? `${id}-company` : null,
    company_name: "Exempelbygg AB",
    email: "kund@exempelbygg.test",
    created_at: "2026-10-22T08:00:00Z",
    deleted_at: null,
    ...extra,
  };
}

const customer = account("c1", "customer");
const inEnglish = (ui: ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);
const onOpenChange = vi.fn();

describe("editing an account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profiles = [customer];
    m.companies = [{ ...lumen, id: "c1-company", name: "Exempelbygg AB" }, lumen];
  });

  it("opens with the account's details, and keeps the password and the company when unchanged", async () => {
    m.update.mockResolvedValue(undefined);
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={customer} />);
    expect(screen.getByRole("heading", { name: "Edit account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toHaveTextContent("Exempelbygg AB");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Erik Nyman" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // No company_id: the membership is sent only when it changes, and never a company name.
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith({
        id: "c1",
        role: "customer",
        full_name: "Erik Nyman",
        email: "kund@exempelbygg.test",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows no company for an admin", () => {
    const admin = account("a2", "admin", { email: "a2@mini-ats.test" });
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={admin} />);
    expect(screen.queryByLabelText("Company")).toBeNull();
  });

  it("checks a new password with the same rules as creating one", async () => {
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={customer} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("The password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("points to Borttagna konton when the email belongs to a deleted account", async () => {
    m.profiles = [
      customer,
      account("c2", "customer", { email: "old@exempel.test", deleted_at: "2026-10-20T08:00:00Z" }),
    ];
    m.update.mockRejectedValue(new AppError("email_exists"));
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={customer} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "OLD@exempel.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Restore it under Deleted accounts/)).toBeInTheDocument();
  });

  it("deletes after a confirm that names the date and keeps the company's data", async () => {
    m.remove.mockResolvedValue(undefined);
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={customer} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/deleted for good on \d+ \w+ \d{4}/);
    expect(confirm).toHaveTextContent("The company's jobs, candidates and cards stay.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m.remove).toHaveBeenCalledWith("c1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not let an admin delete or demote itself", () => {
    const me = account("admin", "admin", { email: "admin@mini-ats.test" });
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={me} />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByLabelText("Role")).toBeDisabled();
    expect(screen.getByText("You cannot remove your own admin role.")).toBeInTheDocument();
  });
});

describe("a new account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profiles = [];
    m.companies = [lumen];
  });

  it("joins the company it was opened from", async () => {
    m.create.mockResolvedValue("new-id");
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} companyId="co1" />);
    expect(screen.getByLabelText("Company")).toHaveTextContent("Lumen AB");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Karin Exempel" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "karin@lumen.test" } });
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "long-enough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith({
        role: "customer",
        full_name: "Karin Exempel",
        email: "karin@lumen.test",
        password: "long-enough",
        company_id: "co1",
      }),
    );
  });

  it("asks a customer to choose a company", async () => {
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Karin Exempel" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "karin@lumen.test" } });
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "long-enough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Choose a company.")).toBeInTheDocument();
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe("deleted accounts", () => {
  const gone = account("c1", "customer", { deleted_at: "2026-10-22T10:00:00Z" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows each account with the date it is deleted for good, and restores it", async () => {
    m.restore.mockResolvedValue(undefined);
    inEnglish(<DeletedAccounts accounts={[gone]} />);
    expect(screen.getAllByText("Deleted for good on 21 Nov 2026").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(m.restore).toHaveBeenCalledWith("c1"));
    expect(m.toast.success).toHaveBeenCalledWith("The account is restored.");
  });

  it("deletes the login for good only after the email is typed, and says the data stays", async () => {
    m.deleteNow.mockResolvedValue(undefined);
    inEnglish(<DeletedAccounts accounts={[gone]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("stay with the company");
    const button = within(confirm).getByRole("button", { name: "Delete for good" });
    expect(button).toBeDisabled();
    const input = within(confirm).getByLabelText("Type kund@exempelbygg.test to confirm.");
    fireEvent.change(input, { target: { value: "Exempelbygg AB" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "kund@exempelbygg.test" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(m.deleteNow).toHaveBeenCalledWith("c1"));
  });

  it("has an empty state", () => {
    inEnglish(<DeletedAccounts accounts={[]} />);
    expect(screen.getByText("No deleted accounts")).toBeInTheDocument();
  });
});
