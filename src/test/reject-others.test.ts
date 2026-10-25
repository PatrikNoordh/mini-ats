import { beforeEach, describe, expect, it, vi } from "vitest";

import { rejectApplications } from "@/lib/api/applications";
import { otherOpenApplications } from "@/lib/stages";
import type { Application, Stage } from "@/types";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const card = (id: string, stage: Stage, candidate = "c1"): Application => ({
  id,
  customer_id: CUSTOMER,
  job_id: `job-${id}`,
  candidate_id: candidate,
  stage,
  position: 0,
  stage_changed_at: "2026-10-01T08:00:00.000Z",
  created_at: "2026-10-01T08:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
});

describe("the hired candidate's other open applications", () => {
  const hired = card("h", "hired");

  it("are the candidate's other cards in every stage but Hired and Rejected", () => {
    const open = (["new", "screening", "interview", "offer"] as const).map((s) => card(s, s));
    const all = [hired, ...open, card("x", "hired"), card("r", "rejected"), card("o", "new", "c2")];
    expect(otherOpenApplications(all, hired).map((a) => a.id)).toEqual([
      "new",
      "screening",
      "interview",
      "offer",
    ]);
  });

  it("are none when the candidate has no other open card", () => {
    expect(otherOpenApplications([hired, card("r", "rejected")], hired)).toEqual([]);
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
    await expect(rejectApplications(CUSTOMER, ["a", "b"])).resolves.toEqual({
      moved: 2,
      failed: 0,
    });
    expect(rpc.mock.calls).toEqual([
      ["move_application", { application_id: "a", customer_id: CUSTOMER, new_stage: "rejected" }],
      ["move_application", { application_id: "b", customer_id: CUSTOMER, new_stage: "rejected" }],
    ]);
  });

  it("keeps going after a failed move and counts it", async () => {
    rpc
      .mockResolvedValueOnce(moved("a"))
      .mockResolvedValueOnce({ data: null, error: new Error("card_not_found") })
      .mockResolvedValueOnce(moved("c"));
    await expect(rejectApplications(CUSTOMER, ["a", "b", "c"])).resolves.toEqual({
      moved: 2,
      failed: 1,
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
