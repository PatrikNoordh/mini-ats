import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StageManager } from "@/components/pipeline/StageManager";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import { stageLabel } from "@/lib/stages";
import type { PipelineStage } from "@/types";
import { customStage, DEFAULT_TEST_STAGES, stageId, TEST_CUSTOMER } from "./stage-fixtures";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  rename: vi.fn(),
  colour: vi.fn(),
  remove: vi.fn(),
  reset: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useStages", () => {
  const hook = (fn: typeof mocks.add) => () => ({ mutateAsync: fn, isPending: false });
  return {
    useAddStage: hook(mocks.add),
    useRenameStage: hook(mocks.rename),
    useSetStageColour: hook(mocks.colour),
    useRemoveStage: hook(mocks.remove),
    useResetStages: hook(mocks.reset),
  };
});

const en = getI18n("en");

/** The manager with a plain list of columns, each with its menu, standing in for the board. */
function renderManager(
  stages: PipelineStage[] = DEFAULT_TEST_STAGES,
  cardCounts = new Map<string, number>(),
) {
  render(
    <I18nextProvider i18n={en}>
      <StageManager customerId={TEST_CUSTOMER} stages={stages} cardCounts={cardCounts}>
        {(menu) => (
          <ul>
            {stages.map((s) => (
              <li key={s.id}>
                {stageLabel(s, en.t)}
                {menu(s)}
              </li>
            ))}
          </ul>
        )}
      </StageManager>
    </I18nextProvider>,
  );
}

/** Opens a column's menu from the keyboard. */
async function openMenu(label: string) {
  const trigger = screen.getByRole("button", { name: `Column menu for ${label}` });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

/** Picks a menu item; dialogs open on the next tick, after the menu has closed. */
async function pick(menu: HTMLElement, name: string) {
  fireEvent.click(within(menu).getByRole("menuitem", { name }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("editing the columns from the board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [mocks.add, mocks.rename, mocks.colour, mocks.remove, mocks.reset]) {
      fn.mockResolvedValue(undefined);
    }
  });

  it("renames a column, refusing a name another column shows", async () => {
    renderManager();
    await pick(await openMenu("Interview"), "Rename");
    const dialog = await screen.findByRole("dialog", { name: "Rename the column" });
    const input = within(dialog).getByLabelText("Name");
    expect(input).toHaveValue("Interview");

    fireEvent.change(input, { target: { value: " screening " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("There is already a column with that name."),
    ).toBeTruthy();
    expect(mocks.rename).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  Kodtest " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.rename).toHaveBeenCalledWith({ id: stageId("interview"), name: "Kodtest" }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith("The column is now called Kodtest.");
  });

  it("shows a name the database finds taken as a field error", async () => {
    mocks.rename.mockRejectedValue(new AppError("stage_name_taken"));
    renderManager();
    await pick(await openMenu("Offer"), "Rename");
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Taken" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("There is already a column with that name."),
    ).toBeTruthy();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("changes a column's colour from the palette", async () => {
    renderManager();
    const menu = await openMenu("New");
    expect(within(menu).getByRole("menuitemradio", { name: "Grey" })).toBeChecked();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Teal" }));
    await waitFor(() =>
      expect(mocks.colour).toHaveBeenCalledWith({ id: stageId("new"), colour: "teal" }),
    );
  });

  it("removes an empty column after a confirm", async () => {
    renderManager();
    await pick(await openMenu("Offer"), "Remove column");
    const confirm = await screen.findByRole("alertdialog", { name: "Remove the column?" });
    expect(confirm).toHaveTextContent("The column Offer will be removed from the board.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(stageId("offer")));
  });

  it("does not remove a column with cards, and says why in the menu", async () => {
    renderManager(DEFAULT_TEST_STAGES, new Map([[stageId("screening"), 2]]));
    const menu = await openMenu("Screening");
    const item = within(menu).getByRole("menuitem", { name: "Remove column" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAccessibleDescription(
      "The column has cards. Move them to another column first.",
    );
    await pick(menu, "Remove column");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not remove the only Hired column, and says why", async () => {
    renderManager();
    const item = within(await openMenu("Hired")).getByRole("menuitem", { name: "Remove column" });
    expect(item).toHaveAccessibleDescription("The board needs a column for hired candidates.");
  });

  it("adds a column with the first unused colour", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    const dialog = await screen.findByRole("dialog", { name: "New column" });
    expect(dialog).toHaveTextContent(
      "The new column goes before the columns for hired and rejected candidates.",
    );
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Referenser" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith({ name: "Referenser", colour: "teal" }),
    );
  });

  it("cannot add an eleventh column, and says why", () => {
    const ten = [
      ...DEFAULT_TEST_STAGES,
      ...[1, 2, 3, 4].map((n) => customStage(`x${n}`, `Extra ${n}`, 5 + n)),
    ];
    renderManager(ten);
    const add = screen.getByRole("button", { name: "Add column" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(
      "The board already has 10 columns, the most it can have.",
    );
  });

  it("resets the columns after a confirm", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Reset the columns?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalled());
    expect(mocks.toast.success).toHaveBeenCalledWith("The columns have been reset.");
  });

  it("cannot reset while a column it would remove has cards, with the same hint", () => {
    const own = customStage("refs", "Referenser", 6);
    renderManager([...DEFAULT_TEST_STAGES, own], new Map([[own.id, 1]]));
    const reset = screen.getByRole("button", { name: "Reset columns" });
    expect(reset).toBeDisabled();
    expect(reset).toHaveAccessibleDescription(
      "The column has cards. Move them to another column first.",
    );
  });
});
