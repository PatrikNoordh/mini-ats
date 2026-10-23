import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  pending: { isPending: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useChangePassword", () => ({
  useChangePassword: () => ({ mutateAsync: mocks.change, ...mocks.pending }),
}));

const onOpenChange = vi.fn();

function openDialog() {
  render(
    <I18nextProvider i18n={getI18n("en")}>
      <ChangePasswordDialog open onOpenChange={onOpenChange} email="admin@mini-ats.test" />
    </I18nextProvider>,
  );
}

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Repeat the new password"), {
    target: { value: confirm },
  });
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Change password" }));

describe("the change password dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.isPending = false;
    mocks.change.mockResolvedValue({ otherSessionsSignedOut: true });
  });

  it("names the signed-in account and labels every field as a password", () => {
    openDialog();
    expect(screen.getByText(/For the account admin@mini-ats\.test\./)).toBeTruthy();
    for (const label of ["Current password", "New password", "Repeat the new password"]) {
      expect(screen.getByLabelText(label).getAttribute("type")).toBe("password");
    }
    expect(screen.getByLabelText("Current password").getAttribute("autocomplete")).toBe(
      "current-password",
    );
  });

  it("changes the password, closes and says the other devices are signed out", async () => {
    openDialog();
    fill("Gammalt-lösen-1", "Blå-Katt-47");
    submit();
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith({
        current: "Gammalt-lösen-1",
        next: "Blå-Katt-47",
      }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "The password is changed. Your other devices will be signed out.",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the problems under the fields and sends nothing", () => {
    openDialog();
    fill("", "kort", "annat");
    submit();
    expect(screen.getByText("Enter your current password.")).toBeTruthy();
    expect(screen.getByText("The password must be at least 8 characters.")).toBeTruthy();
    expect(screen.getByText("The passwords do not match.")).toBeTruthy();
    expect(screen.getByLabelText("New password").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("stays open and says so when the current password is wrong", async () => {
    mocks.change.mockRejectedValue(new AppError("wrong_current_password"));
    openDialog();
    fill("fel-lösen-1", "Blå-Katt-47");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current password is not correct.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("says when the other devices could not be signed out", async () => {
    mocks.change.mockResolvedValue({ otherSessionsSignedOut: false });
    openDialog();
    fill("Gammalt-lösen-1", "Blå-Katt-47");
    submit();
    await waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        "The password is changed, but your other devices could not be signed out.",
      ),
    );
  });

  it("shows it is working and cannot be sent twice", () => {
    mocks.pending.isPending = true;
    openDialog();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
