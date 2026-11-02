import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAssessments } from "@/lib/api/assessments";

// The delete chain from().delete().eq().eq(), awaited at the end, recording every call.
const db = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const result: { error: unknown } = { error: null };
  const chain = {
    from: (...args: unknown[]) => (calls.push(["from", ...args]), chain),
    delete: () => (calls.push(["delete"]), chain),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), chain),
    then: (resolve: (value: { error: unknown }) => void) => resolve(result),
  };
  return { calls, result, chain };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.chain.from } }));
vi.mock("@/lib/api/functions", () => ({ invokeFunction: vi.fn() }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";

describe("removing an application's assessments (ATS-56)", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result.error = null;
  });

  it("removes every assessment of the application, scoped to the active customer", async () => {
    await expect(deleteAssessments(CUSTOMER, "app1")).resolves.toBeUndefined();
    expect(db.calls).toEqual([
      ["from", "cv_assessments"],
      ["delete"],
      // RLS lets an admin delete any customer's rows: only the active customer's are meant.
      ["eq", "customer_id", CUSTOMER],
      ["eq", "application_id", "app1"],
    ]);
  });

  it("passes a failed delete on", async () => {
    const error = new Error("network");
    db.result.error = error;
    await expect(deleteAssessments(CUSTOMER, "app1")).rejects.toBe(error);
  });
});
