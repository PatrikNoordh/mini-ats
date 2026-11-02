import { screen } from "@testing-library/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Board, type BoardCard } from "@/components/pipeline/Board";
import { getI18n } from "@/lib/i18n";
import { neighbourStageId } from "@/lib/stages";
import type { PipelineStage } from "@/types";
import { customStage, DEFAULT_TEST_STAGES, stageId } from "./stage-fixtures";

const card: BoardCard = {
  candidateName: "Test Testsson",
  jobTitle: "Platschef",
  app: {
    id: "30000000-0000-0000-0000-0000000000a1",
    customer_id: "00000000-0000-0000-0000-0000000000a1",
    job_id: "10000000-0000-0000-0000-0000000000a1",
    candidate_id: "20000000-0000-0000-0000-0000000000a1",
    stage_id: stageId("screening"),
    position: 0,
    stage_changed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

let root: Root | null = null;

function renderBoard(stages: readonly PipelineStage[] = DEFAULT_TEST_STAGES) {
  const onOpen = vi.fn();
  const onMove = vi.fn();
  const onReorder = vi.fn();
  const container = document.body.appendChild(document.createElement("div"));
  act(() => {
    root = createRoot(container);
    root.render(
      <I18nextProvider i18n={getI18n("en")}>
        <Board
          stages={stages}
          cards={[card]}
          onOpen={onOpen}
          onMove={onMove}
          onReorder={onReorder}
        />
      </I18nextProvider>,
    );
  });
  const cardButton = container.querySelector<HTMLElement>('[aria-roledescription="draggable"]');
  if (!cardButton) throw new Error("Board did not render the card");
  return { onOpen, onMove, onReorder, cardButton };
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

  it("names each column after its stage, and the card sits in its own stage's column", () => {
    const { cardButton } = renderBoard();
    const columns = [...document.querySelectorAll('[role="group"]')];
    const name = (column: Element) =>
      document.getElementById(column.getAttribute("aria-labelledby") ?? "")?.textContent;
    expect(columns.map(name)).toEqual([
      "New",
      "Screening",
      "Interview",
      "Offer",
      "Hired",
      "Rejected",
    ]);
    expect(name(cardButton.closest('[role="group"]') ?? cardButton)).toBe("Screening");
  });

  it("shows a renamed or added stage by the name the customer gave it, in the customer's order", () => {
    const renamed = DEFAULT_TEST_STAGES.map((s) =>
      s.default_key === "interview" ? { ...s, name: "Kodtest" } : s,
    );
    renderBoard([
      ...renamed.slice(0, 2),
      customStage("refs", "Referenser", 2),
      ...renamed.slice(2),
    ]);
    const columns = [...document.querySelectorAll('[role="group"]')];
    const name = (column: Element) =>
      document.getElementById(column.getAttribute("aria-labelledby") ?? "")?.textContent;
    expect(columns.map(name)).toEqual([
      "New",
      "Screening",
      "Referenser",
      "Kodtest",
      "Offer",
      "Hired",
      "Rejected",
    ]);
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

  it("makes each column header a labelled handle that moves the column (ATS-41)", () => {
    renderBoard();
    const handle = screen.getByRole("button", { name: "Move the column Interview" });
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAccessibleDescription(
      "Press space to pick up the column, move it with the left and right arrow keys and press space again to drop it. Escape cancels the move.",
    );
    // The column keeps its own name, which says where a card is.
    const columns = document.querySelectorAll('[role="group"]');
    expect(columns[2]).toHaveAccessibleName("Interview");
  });

  it("picks a column up with space, and escape puts it back and says where it stays", async () => {
    const { onReorder, onMove } = renderBoard();
    const handle = screen.getByRole("button", { name: "Move the column Interview" });
    press(handle, "Space", " ");
    // Picked up. jsdom has no layout, so where the column is held is checked end to end instead.
    expect(handle).toHaveAttribute("aria-pressed", "true");
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    press(handle, "Escape", "Escape");
    expect(document.body.textContent).toContain(
      "Move cancelled. The column Interview stays at position 3 of 6.",
    );
    expect(onReorder).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("tells screen reader users how to move a card, in the chosen language", () => {
    renderBoard();
    expect(document.body.textContent).toContain("Press space to pick up the card");
  });
});

describe("neighbourStageId", () => {
  const stages = DEFAULT_TEST_STAGES;

  it("steps one column left or right and stops at the ends", () => {
    expect(neighbourStageId(stages, stageId("screening"), 1)).toBe(stageId("interview"));
    expect(neighbourStageId(stages, stageId("screening"), -1)).toBe(stageId("new"));
    expect(neighbourStageId(stages, stageId("new"), -1)).toBeUndefined();
    expect(neighbourStageId(stages, stageId("rejected"), 1)).toBeUndefined();
  });

  it("follows the customer's order, and knows no neighbour of an unknown stage", () => {
    const reordered = [stages[1]!, stages[0]!, ...stages.slice(2)];
    expect(neighbourStageId(reordered, stageId("new"), 1)).toBe(stageId("interview"));
    expect(neighbourStageId(stages, "stage-gone", 1)).toBeUndefined();
  });
});
