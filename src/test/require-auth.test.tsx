import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "@/components/auth/Guards";
import { getI18n } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { id: string; email: string } | null, isLoading: false },
  navigate: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@tanstack/react-router", () => ({
  // Records where the guard sends the user, instead of navigating.
  Navigate: (props: unknown) => {
    mocks.navigate(props);
    return null;
  },
  useRouterState: () => "/candidates?x=1",
}));

function renderGuard() {
  const ui = () => (
    <I18nextProvider i18n={getI18n("en")}>
      <RequireAuth>page</RequireAuth>
    </I18nextProvider>
  );
  const view = render(ui());
  return { rerender: () => view.rerender(ui()) };
}

describe("RequireAuth", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.auth = { user: null, isLoading: false };
  });

  it("sends a signed-out visit to login with the page it asked for", () => {
    renderGuard();
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/login",
      search: { redirect: "/candidates?x=1" },
      replace: true,
    });
  });

  it("sends a sign-out to a bare login, so the next account starts fresh", () => {
    mocks.auth = { user: { id: "u1", email: "anna@test.local" }, isLoading: false };
    const view = renderGuard();
    expect(mocks.navigate).not.toHaveBeenCalled();

    mocks.auth = { user: null, isLoading: false };
    view.rerender();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenLastCalledWith({ to: "/login", replace: true });
  });
});
