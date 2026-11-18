import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcceptInvite } from "@/components/auth/AcceptInvite";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";

const m = vi.hoisted(() => ({
  auth: { user: null as { email: string } | null, isLoading: false, signOut: vi.fn() },
  verifyInvite: vi.fn(),
  setOwnPassword: vi.fn(),
  navigate: vi.fn(),
  toast: { success: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/lib/api/auth", () => ({
  verifyInvite: m.verifyInvite,
  setOwnPassword: m.setOwnPassword,
}));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
  Link: ({ children }: { children: ReactNode }) => <a href="/login">{children}</a>,
}));

const TOKEN = "0123456789abcdef";
const inEnglish = (ui: ReactNode) =>
  render(<I18nextProvider i18n={getI18n("en")}>{ui}</I18nextProvider>);

function choose(password: string, repeat = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: repeat } });
  fireEvent.click(screen.getByRole("button", { name: "Set password and sign in" }));
}

describe("accepting an invite (ATS-50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.user = null;
    m.auth.isLoading = false;
  });

  it("does nothing with the invite until the form is sent, so opening the link keeps it usable", () => {
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    expect(screen.getByRole("heading", { name: "Accept your invite" })).toBeInTheDocument();
    expect(m.verifyInvite).not.toHaveBeenCalled();
  });

  it("verifies the invite, sets the password and opens the app", async () => {
    m.verifyInvite.mockResolvedValue({ id: "u1", email: "ny@lumen.test" });
    m.setOwnPassword.mockResolvedValue(undefined);
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    await waitFor(() =>
      expect(m.navigate).toHaveBeenCalledWith({ to: "/pipeline", replace: true }),
    );
    expect(m.verifyInvite).toHaveBeenCalledWith(TOKEN);
    expect(m.setOwnPassword).toHaveBeenCalledWith("Blå-Katt-47");
    expect(m.toast.success).toHaveBeenCalled();
  });

  it("checks the password before the invite is used", () => {
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    choose("short");
    expect(screen.getByText("The password must be at least 8 characters.")).toBeInTheDocument();
    choose("Blå-Katt-47", "Blå-Katt-48");
    expect(screen.getByLabelText("Repeat the password")).toHaveAttribute("aria-invalid", "true");
    expect(m.verifyInvite).not.toHaveBeenCalled();
  });

  it("says clearly when the link has expired or was used", async () => {
    m.verifyInvite.mockRejectedValue(new AppError("invite_invalid"));
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invite link has expired, has already been used or has been replaced by a newer invite.",
    );
    expect(m.setOwnPassword).not.toHaveBeenCalled();
  });

  it("after a failed password save, tries the password again without the used link", async () => {
    m.verifyInvite.mockResolvedValue({ id: "u1", email: "ny@lumen.test" });
    m.setOwnPassword.mockRejectedValueOnce(new AppError("weak_password"));
    m.setOwnPassword.mockResolvedValueOnce(undefined);
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    choose("Blå-Katt-47");
    await screen.findByRole("alert");
    choose("Grön-Häst-52");
    await waitFor(() => expect(m.navigate).toHaveBeenCalled());
    expect(m.verifyInvite).toHaveBeenCalledTimes(1);
  });

  it("shows the expired message without a form when the link holds no invite", () => {
    inEnglish(<AcceptInvite tokenHash={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This invite link has expired");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("asks someone already signed in here to sign out first", () => {
    m.auth.user = { email: "admin@mini-ats.test" };
    inEnglish(<AcceptInvite tokenHash={TOKEN} />);
    expect(screen.getByText(/You are signed in as admin@mini-ats.test/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(m.auth.signOut).toHaveBeenCalled();
  });
});
