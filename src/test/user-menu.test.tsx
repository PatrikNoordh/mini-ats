import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/layout/UserMenu";
import { getI18n } from "@/lib/i18n";
import type { Profile, Role } from "@/types";

const mocks = vi.hoisted(() => ({ role: "customer" as Role }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageMenuItems: () => null }));
vi.mock("@/hooks/useChangePassword", () => ({
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/contexts/AuthContext", () => {
  const profile = (role: Role): Profile => ({
    id: "u1",
    role,
    full_name: "Erik Exempel",
    company_name: "Exempelbygg AB",
    email: "kund@exempelbygg.test",
    created_at: "2026-10-01T08:00:00Z",
    deleted_at: null,
  });
  return {
    useAuth: () => ({
      user: { id: "u1", email: "kund@exempelbygg.test" },
      profile: profile(mocks.role),
      signOut: vi.fn(),
    }),
  };
});

/** Opens the menu from the keyboard, the way a keyboard user does. */
function openMenu() {
  const trigger = screen.getByRole("button", { name: "User menu" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("changing the password from the user menu", () => {
  beforeEach(() => {
    mocks.role = "customer";
  });

  for (const role of ["customer", "admin"] as const) {
    it(`opens the dialog for the signed-in account, as ${role}`, async () => {
      mocks.role = role;
      render(
        <I18nextProvider i18n={getI18n("en")}>
          <UserMenu />
        </I18nextProvider>,
      );
      openMenu();
      fireEvent.click(await screen.findByRole("menuitem", { name: "Change password" }));
      const dialog = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(dialog).toHaveTextContent("For the account kund@exempelbygg.test."),
      );
    });
  }
});
