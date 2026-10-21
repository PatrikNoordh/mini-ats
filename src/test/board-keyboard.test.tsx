import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Board, type BoardCard } from "@/components/pipeline/Board";
import { getI18n } from "@/lib/i18n";
import { neighbourStage } from "@/lib/stages";

const card: BoardCard = {
  candidateName: "Test Testsson",
  jobTitle: "Platschef",
  app: {
    id: "30000000-0000-0000-0000-0000000000a1",
    customer_id: "00000000-0000-0000-0000-0000000000a1",
    job_id: "10000000-0000-0000-0000-0000000000a1",
    candidate_id: "20000000-0000-0000-0000-0000000000a1",
    stage: "screening",
    position: 0,
    stage_changed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

let root: Root | null = null;

function renderBoard() {
  const onOpen = vi.fn();
  const onMove = vi.fn();
  const container = document.body.appendChild(document.createElement("div"));
  act(() => {
    root = createRoot(container);
    root.render(
      <I18nextProvider i18n={getI18n("en")}>
        <Board cards={[card]} onOpen={onOpen} onMove={onMove} />
      </I18nextProvider>,
    );
  });
  const cardButton = container.querySelector<HTMLElement>('[aria-roledescription="draggable"]');
  if (!cardButton) throw new Error("Board did not render the card");
  return { onOpen, onMove, cardButton };
}

function press(target: EventTarget, code: string, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true }));
  });
}

describe("the board with a keyboard", () => {
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
  });

  it("names each card with the candidate, the job and the days in stage, and can focus it", () => {
    const { cardButton } = renderBoard();
    expect(cardButton).toHaveAttribute("role", "button");
    expect(cardButton).toHaveAttribute("aria-label", "Test Testsson, Platschef, 0 days in stage");
    expect(cardButton).toHaveAttribute("tabindex", "0");
  });

  it("opens the card with Enter", () => {
    const { cardButton, onOpen } = renderBoard();
    press(cardButton, "Enter", "Enter");
    expect(onOpen).toHaveBeenCalledWith(card);
  });

  it("picks the card up with space instead of opening it, and escape puts it back", async () => {
    const { cardButton, onOpen, onMove } = renderBoard();
    press(cardButton, "Space", " ");
    expect(document.body.textContent).toContain("Picked up Test Testsson from Screening.");
    // dnd-kit starts listening for the keys that end a drag on the next tick.
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    press(cardButton, "Escape", "Escape");
    expect(document.body.textContent).toContain(
      "Move cancelled. Test Testsson stays in Screening.",
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("tells screen reader users how to move a card, in the chosen language", () => {
    renderBoard();
    expect(document.body.textContent).toContain("Press space to pick up the card");
  });
});

describe("neighbourStage", () => {
  it("steps one column left or right and stops at the ends", () => {
    expect(neighbourStage("screening", 1)).toBe("interview");
    expect(neighbourStage("screening", -1)).toBe("new");
    expect(neighbourStage("new", -1)).toBeUndefined();
    expect(neighbourStage("rejected", 1)).toBeUndefined();
  });
});
