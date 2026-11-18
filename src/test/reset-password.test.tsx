import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPassword } from "@/components/auth/ForgotPassword";
import { ResetPassword } from "@/components/auth/ResetPassword";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";

const m = vi.hoisted(() => ({
  auth: { user: null as { email: string } | null, isLoading: false, signOut: vi.fn() },
  requestPasswordReset: vi.fn(),
  verifyRecovery: vi.fn(),
  resetOwnPassword: vi.fn(),
  navigate: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/lib/api/auth", () => ({
  requestPasswordReset: m.requestPasswordReset,
  verifyRecovery: m.verifyRecovery,
  resetOwnPassword: m.resetOwnPassword,
}));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const TOKEN = "0123456789abcdef";
const inEnglish = (ui: ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);

describe("asking for a reset link (ATS-51)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ask = (email: string) => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
  };

  it("says the same for every address once the request is sent", async () => {
    m.requestPasswordReset.mockResolvedValue(undefined);
    inEnglish(<ForgotPassword />);
    ask(" kund@lumen.test ");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If kund@lumen.test has an account, a link to choose a new password is on its way.",
    );
    expect(m.requestPasswordReset).toHaveBeenCalledWith("kund@lumen.test");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("checks the address before sending anything", () => {
    inEnglish(<ForgotPassword />);
    ask("kund@");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(m.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("shows a failed request and keeps the form", async () => {
    m.requestPasswordReset.mockRejectedValue(new AppError("network_error"));
    inEnglish(<ForgotPassword />);
    ask("kund@lumen.test");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("links back to sign in", () => {
    inEnglish(<ForgotPassword />);
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });
});

describe("choosing a new password from the link (ATS-51)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.user = null;
  });

  const choose = (password: string) => {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), {
      target: { value: password },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password and sign in" }));
  };

  it("does nothing with the link until the form is sent, so opening it keeps it usable", () => {
    inEnglish(<ResetPassword tokenHash={TOKEN} />);
    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(m.verifyRecovery).not.toHaveBeenCalled();
  });

  it("uses the link, saves the password and opens the app", async () => {
    m.verifyRecovery.mockResolvedValue({ id: "u1", email: "kund@lumen.test" });
    m.resetOwnPassword.mockResolvedValue({ otherSessionsSignedOut: true });
    inEnglish(<ResetPassword tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    await waitFor(() =>
      expect(m.navigate).toHaveBeenCalledWith({ to: "/pipeline", replace: true }),
    );
    expect(m.verifyRecovery).toHaveBeenCalledWith(TOKEN);
    expect(m.resetOwnPassword).toHaveBeenCalledWith("Blå-Katt-47");
    expect(m.toast.success).toHaveBeenCalledWith("Your password is changed.");
  });

  it("warns when the other devices could not be signed out", async () => {
    m.verifyRecovery.mockResolvedValue({ id: "u1", email: "kund@lumen.test" });
    m.resetOwnPassword.mockResolvedValue({ otherSessionsSignedOut: false });
    inEnglish(<ResetPassword tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("refuses a deleted account and saves nothing", async () => {
    m.verifyRecovery.mockRejectedValue(new AppError("account_or_company_deleted"));
    inEnglish(<ResetPassword tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The account or its company has been deleted.",
    );
    expect(m.resetOwnPassword).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("says clearly when the link has expired or was used", async () => {
    m.verifyRecovery.mockRejectedValue(new AppError("reset_link_invalid"));
    inEnglish(<ResetPassword tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired, has already been used or has been replaced by a newer one.",
    );
  });

  it("offers a new link when the link holds no token", () => {
    inEnglish(<ResetPassword tokenHash={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This link has expired");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
