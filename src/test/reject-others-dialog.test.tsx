import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { RejectOthersDialog } from "@/components/pipeline/RejectOthersDialog";
import { getI18n } from "@/lib/i18n";
import type { Language } from "@/lib/language";

function renderDialog(options: { count?: number; busy?: boolean; language?: Language } = {}) {
  const onConfirm = vi.fn();
  const onKeep = vi.fn();
  render(
    <I18nextProvider i18n={getI18n(options.language ?? "en")}>
      <RejectOthersDialog
        name="Max Demo"
        count={options.count ?? 2}
        busy={options.busy ?? false}
        onConfirm={onConfirm}
        onKeep={onKeep}
      />
    </I18nextProvider>,
  );
  return { onConfirm, onKeep };
}

describe("the prompt after a move to Hired", () => {
  it("names the candidate and uses the singular for one application", () => {
    renderDialog({ count: 1 });
    expect(
      screen.getByText("Max Demo also has 1 other open application. Move it to Rejected?"),
    ).toBeTruthy();
  });

  it("uses the plural for several applications, in Swedish too", () => {
    renderDialog({ count: 3, language: "sv" });
    expect(
      screen.getByText("Max Demo har även 3 andra öppna ansökningar. Flytta dem till Avböjd?"),
    ).toBeTruthy();
  });

  it("gives Keep the focus, so Enter never moves cards by mistake", async () => {
    const { onKeep } = renderDialog();
    const keep = await screen.findByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(onKeep).toHaveBeenCalled();
  });

  it("moves the cards on confirm", () => {
    const first = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Move to Rejected" }));
    expect(first.onConfirm).toHaveBeenCalledOnce();
  });

  it("shows it is working while the cards move", () => {
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: "Moving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
  });
});
