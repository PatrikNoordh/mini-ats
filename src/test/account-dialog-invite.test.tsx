import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDialog } from "@/components/accounts/AccountDialog";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import type { Company, Profile } from "@/types";

// Email is on, as on the local stack and in CI (ATS-50).
vi.mock("@/lib/features", () => ({ EMAIL_ENABLED: true }));

const m = vi.hoisted(() => ({
  create: vi.fn(),
  resend: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { id: "admin" } }) }));
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false });
vi.mock("@/hooks/useProfiles", () => ({
  useProfiles: () => ({ data: [] }),
  useCreateProfile: () => mutation(m.create),
  useUpdateProfile: () => mutation(vi.fn()),
  useDeleteProfile: () => mutation(vi.fn()),
  useResendInvite: () => mutation(m.resend),
}));
const lumen: Company = {
  id: "co1",
  name: "Lumen AB",
  created_at: "2026-10-01T08:00:00Z",
  deleted_at: null,
};
vi.mock("@/hooks/useCompanies", () => ({ useCompanies: () => ({ data: [lumen] }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/history">{children}</a>,
}));

const invitee: Profile = {
  id: "u1",
  role: "customer",
  full_name: "Ny Användare",
  company_id: "co1",
  email: "ny@lumen.test",
  created_at: "2026-11-18T08:00:00Z",
  deleted_at: null,
};

const inEnglish = (ui: ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);
const onOpenChange = vi.fn();

function fillNewMember() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ny Användare" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ny@lumen.test" } });
}

describe("a new account with email on (ATS-50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invites by default: no password field, and the invite is sent", async () => {
    m.create.mockResolvedValue("u1");
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} companyId="co1" />);
    expect(screen.getByRole("radio", { name: "Send an invite by email" })).toBeChecked();
    expect(screen.queryByLabelText("Temporary password")).not.toBeInTheDocument();

    fillNewMember();
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith({
        role: "customer",
        full_name: "Ny Användare",
        email: "ny@lumen.test",
        invite: true,
        company_id: "co1",
      }),
    );
    expect(m.toast.success).toHaveBeenCalledWith("The invite has been sent to ny@lumen.test.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("can still set a temporary password instead", async () => {
    m.create.mockResolvedValue("u1");
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} companyId="co1" />);
    fireEvent.click(screen.getByRole("radio", { name: "Set a temporary password" }));
    fillNewMember();
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "long-enough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: "long-enough", company_id: "co1" }),
      ),
    );
    expect(m.create.mock.calls[0]?.[0]).not.toHaveProperty("invite");
  });

  it("says so when the invite could not be sent, and stays open", async () => {
    m.create.mockRejectedValue(new AppError("invite_not_sent"));
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} companyId="co1" />);
    fillNewMember();
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("Resend invite (ATS-50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a new invite to the account and says where", async () => {
    m.resend.mockResolvedValue(undefined);
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={invitee} />);
    fireEvent.click(screen.getByRole("button", { name: "Resend invite" }));
    await waitFor(() => expect(m.resend).toHaveBeenCalledWith("u1"));
    expect(m.toast.success).toHaveBeenCalledWith("A new invite has been sent to ny@lumen.test.");
  });

  it("says why when the account has already accepted its invite", async () => {
    m.resend.mockRejectedValue(new AppError("invite_accepted"));
    inEnglish(<AccountDialog open onOpenChange={onOpenChange} account={invitee} />);
    fireEvent.click(screen.getByRole("button", { name: "Resend invite" }));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
  });

  it("is not offered on the admin's own account", () => {
    inEnglish(
      <AccountDialog
        open
        onOpenChange={onOpenChange}
        account={{ ...invitee, id: "admin", role: "admin", company_id: null }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Resend invite" })).not.toBeInTheDocument();
  });
});
