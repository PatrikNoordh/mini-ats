import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useReorderStages } from "@/hooks/useStages";
import { getI18n } from "@/lib/i18n";
import { queryKeys, withStagesOrdered } from "@/lib/stages";
import { DEFAULT_TEST_STAGES, stageId, TEST_CUSTOMER } from "./stage-fixtures";

const { reorderStages, toastError } = vi.hoisted(() => ({
  reorderStages: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/pipelineStages", () => ({ reorderStages }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const ids = DEFAULT_TEST_STAGES.map((s) => s.id);
/** Interview moved first. */
const reordered = [stageId("interview"), ...ids.filter((id) => id !== stageId("interview"))];

describe("the columns in a new order", () => {
  it("follow the given ids, with positions 0 to n - 1", () => {
    const result = withStagesOrdered(DEFAULT_TEST_STAGES, reordered);
    expect(result.map((s) => s.id)).toEqual(reordered);
    expect(result.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keep a column the list does not name, at the end", () => {
    const result = withStagesOrdered(DEFAULT_TEST_STAGES, reordered.slice(1));
    expect(result.map((s) => s.id).at(-1)).toBe(stageId("interview"));
    expect(result).toHaveLength(DEFAULT_TEST_STAGES.length);
  });
});

let root: Root | null = null;

function renderReorder() {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.stages(TEST_CUSTOMER), DEFAULT_TEST_STAGES);
  const hook: { current: ReturnType<typeof useReorderStages> | null } = { current: null };
  function Probe() {
    hook.current = useReorderStages(TEST_CUSTOMER);
    return null;
  }
  act(() => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    root.render(
      <I18nextProvider i18n={getI18n("en")}>
        <QueryClientProvider client={qc}>
          <Probe />
        </QueryClientProvider>
      </I18nextProvider>,
    );
  });
  if (!hook.current) throw new Error("the hook did not render");
  return { qc, reorder: hook.current.mutateAsync };
}

const cachedIds = (qc: QueryClient) =>
  qc.getQueryData<typeof DEFAULT_TEST_STAGES>(queryKeys.stages(TEST_CUSTOMER))?.map((s) => s.id);

describe("reordering the columns (ATS-41)", () => {
  afterEach(() => {
    act(() => root?.unmount());
    vi.resetAllMocks();
  });

  it("shows the new order at once and saves it through reorder_stages", async () => {
    let finish: (value: unknown) => void = () => undefined;
    reorderStages.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { qc, reorder } = renderReorder();
    let saved: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saved = reorder(reordered);
    });
    expect(cachedIds(qc)).toEqual(reordered);
    expect(reorderStages).toHaveBeenCalledWith(TEST_CUSTOMER, reordered);
    await act(async () => {
      finish(withStagesOrdered(DEFAULT_TEST_STAGES, reordered));
      await saved;
    });
  });

  it("puts the old order back and says so when the save fails", async () => {
    reorderStages.mockRejectedValue(new Error("network"));
    const { qc, reorder } = renderReorder();
    await act(() => reorder(reordered).catch(() => undefined));
    expect(cachedIds(qc)).toEqual(ids);
    expect(toastError).toHaveBeenCalledWith(
      "Could not move the column. The change has been undone.",
      expect.anything(),
    );
  });
});
