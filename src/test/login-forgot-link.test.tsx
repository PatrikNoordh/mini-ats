import { render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { getI18n } from "@/lib/i18n";

const m = vi.hoisted(() => ({ emailEnabled: false }));

vi.mock("@/lib/features", () => ({
  get EMAIL_ENABLED() {
    return m.emailEnabled;
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, isLoading: false, signIn: vi.fn() }),
}));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useSearch: () => ({ redirect: null }),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

async function renderLogin() {
  const { Route } = await import("@/routes/login");
  const Login = Route.options.component;
  if (!Login) throw new Error("The sign-in route has no page");
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <Login />
    </I18nextProvider>,
  );
}

describe("Forgot password? on the sign-in page (ATS-51)", () => {
  it("is offered where the reset email can arrive", async () => {
    m.emailEnabled = true;
    await renderLogin();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("is not offered without email, as in production", async () => {
    m.emailEnabled = false;
    await renderLogin();
    expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
