import { beforeEach, describe, expect, it, vi } from "vitest";

import { rejectApplications } from "@/lib/api/applications";
import { otherOpenApplications } from "@/lib/stages";
import type { Application } from "@/types";
import { customStage, DEFAULT_TEST_STAGES, stageId, TEST_CUSTOMER } from "./stage-fixtures";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const CUSTOMER = TEST_CUSTOMER;
const stages = DEFAULT_TEST_STAGES;
const card = (id: string, stage: string, candidate = "c1"): Application => ({
  id,
  customer_id: CUSTOMER,
  job_id: `job-${id}`,
  candidate_id: candidate,
  stage_id: stageId(stage),
  position: 0,
  stage_changed_at: "2026-10-01T08:00:00.000Z",
  created_at: "2026-10-01T08:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
});

describe("the hired candidate's other open applications", () => {
  const hired = card("h", "hired");

  it("are the candidate's other cards in every open stage, not Hired or Rejected", () => {
    const open = (["new", "screening", "interview", "offer"] as const).map((s) => card(s, s));
    const all = [hired, ...open, card("x", "hired"), card("r", "rejected"), card("o", "new", "c2")];
    expect(otherOpenApplications(all, hired, stages).map((a) => a.id)).toEqual([
      "new",
      "screening",
      "interview",
      "offer",
    ]);
  });

  it("are none when the candidate has no other open card", () => {
    expect(otherOpenApplications([hired, card("r", "rejected")], hired, stages)).toEqual([]);
  });

  it("go by the stage kind: a stage the customer added counts by its kind", () => {
    const withCustom = [
      ...stages,
      customStage("test", "Code test", 6),
      customStage("no", "No thanks", 7, "rejected"),
    ];
    const all = [hired, card("t", "test"), card("n", "no")];
    expect(otherOpenApplications(all, hired, withCustom).map((a) => a.id)).toEqual(["t"]);
  });

  it("leave out a card whose stage the board does not know", () => {
    expect(otherOpenApplications([hired, card("u", "gone")], hired, stages)).toEqual([]);
  });
});

describe("moving the other applications to Rejected", () => {
  const moved = (id: string) => ({ data: card(id, "rejected"), error: null });
  beforeEach(() => {
    rpc.mockReset();
  });

  it("moves each card through move_application, scoped to the customer", async () => {
    rpc.mockImplementation((_name: string, args: { application_id: string }) =>
      Promise.resolve(moved(args.application_id)),
    );
    await expect(rejectApplications(CUSTOMER, ["a", "b"], stageId("rejected"))).resolves.toEqual({
      moved: 2,
      failed: 0,
    });
    expect(rpc.mock.calls).toEqual([
      [
        "move_application",
        { application_id: "a", customer_id: CUSTOMER, new_stage_id: stageId("rejected") },
      ],
      [
        "move_application",
        { application_id: "b", customer_id: CUSTOMER, new_stage_id: stageId("rejected") },
      ],
    ]);
  });

  it("keeps going after a failed move and counts it", async () => {
    rpc
      .mockResolvedValueOnce(moved("a"))
      .mockResolvedValueOnce({ data: null, error: new Error("card_not_found") })
      .mockResolvedValueOnce(moved("c"));
    await expect(
      rejectApplications(CUSTOMER, ["a", "b", "c"], stageId("rejected")),
    ).resolves.toEqual({
      moved: 2,
      failed: 1,
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
