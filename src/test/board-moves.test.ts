import { beforeEach, describe, expect, it, vi } from "vitest";

import { moveApplication } from "@/lib/api/applications";
import { errorCode } from "@/lib/errors";
import { withCardMoved, withCardRestored } from "@/lib/stages";
import type { Application } from "@/types";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const card: Application = {
  id: "30000000-0000-0000-0000-0000000000a1",
  customer_id: "00000000-0000-0000-0000-0000000000a1",
  job_id: "10000000-0000-0000-0000-0000000000a1",
  candidate_id: "20000000-0000-0000-0000-0000000000a1",
  stage: "new",
  position: 0,
  stage_changed_at: "2026-10-01T08:00:00.000Z",
  created_at: "2026-10-01T08:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
};
const other: Application = { ...card, id: "30000000-0000-0000-0000-0000000000a2", position: 1 };

describe("moving a card on the board", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("puts the card last in its new stage and restarts its days in stage", () => {
    const [moved, untouched] = withCardMoved([card, other], card.id, "interview", now);
    expect(moved).toMatchObject({
      stage: "interview",
      position: Number.MAX_SAFE_INTEGER,
      stage_changed_at: now.toISOString(),
    });
    expect(untouched).toBe(other);
  });

  it("puts back only the card whose move failed", () => {
    const afterTwoMoves = withCardMoved(
      withCardMoved([card, other], card.id, "interview", now),
      other.id,
      "offer",
      now,
    );
    const [restored, stillMoved] = withCardRestored(afterTwoMoves, card);
    expect(restored).toBe(card);
    expect(stillMoved?.stage).toBe("offer");
  });
});

describe("moveApplication", () => {
  beforeEach(() => vi.resetAllMocks());

  it("moves the card in one call, scoped to the customer", async () => {
    rpc.mockResolvedValue({ data: { ...card, stage: "screening", position: 4 }, error: null });
    const moved = await moveApplication(card.customer_id, card.id, "screening");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("move_application", {
      application_id: card.id,
      customer_id: card.customer_id,
      new_stage: "screening",
    });
    expect(moved).toMatchObject({ stage: "screening", position: 4 });
  });

  it("says card_not_found when the card is not the customer's", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("card_not_found") });
    const move = moveApplication(card.customer_id, card.id, "hired");
    await expect(move).rejects.toSatisfy((e) => errorCode(e) === "card_not_found");
  });
});
