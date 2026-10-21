import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMoveApplication } from "@/hooks/useApplications";
import { getI18n } from "@/lib/i18n";
import { queryKeys } from "@/lib/stages";
import type { Application } from "@/types";

const { moveApplication, toastError } = vi.hoisted(() => ({
  moveApplication: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/applications", () => ({ moveApplication }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const customerId = "00000000-0000-0000-0000-0000000000a1";
const card: Application = {
  id: "30000000-0000-0000-0000-0000000000a1",
  customer_id: customerId,
  job_id: "10000000-0000-0000-0000-0000000000a1",
  candidate_id: "20000000-0000-0000-0000-0000000000a1",
  stage: "new",
  position: 0,
  stage_changed_at: "2026-10-01T08:00:00.000Z",
  created_at: "2026-10-01T08:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
};

let root: Root | null = null;

/** Renders the move hook and returns its mutateAsync and the query client behind it. */
function renderMove() {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.applications(customerId), [card]);
  const hook: { current: ReturnType<typeof useMoveApplication> | null } = { current: null };
  function Probe() {
    hook.current = useMoveApplication(customerId);
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
  return { qc, move: hook.current.mutateAsync };
}

describe("moving a card while offline", () => {
  afterEach(() => {
    act(() => root?.unmount());
    onlineManager.setOnline(true);
    vi.resetAllMocks();
  });

  it("tries the move at once and puts the card back when it fails", async () => {
    onlineManager.setOnline(false);
    moveApplication.mockRejectedValue(new TypeError("Failed to fetch"));
    const { qc, move } = renderMove();

    await act(() => move({ id: card.id, stage: "interview" }).catch(() => undefined));

    expect(moveApplication).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(queryKeys.applications(customerId))).toEqual([card]);
    expect(toastError).toHaveBeenCalledWith("Could not move the card. The change has been undone.");
  });
});
