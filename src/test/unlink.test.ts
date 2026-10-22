import { beforeEach, describe, expect, it, vi } from "vitest";

import { unlinkCandidate } from "@/lib/api/applications";

// The query builder chain delete().eq().eq().in(), awaited at the end, recording every call.
const db = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const result: { error: unknown } = { error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  for (const method of ["from", "delete", "eq", "in"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  return { calls, result, builder };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: db.builder }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const CANDIDATE = "20000000-0000-0000-0000-0000000000a1";
const JOBS = ["10000000-0000-0000-0000-0000000000a1", "10000000-0000-0000-0000-0000000000a2"];

describe("unlinking a candidate from jobs", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result.error = null;
  });

  it("deletes only that candidate's links to those jobs, for the active customer", async () => {
    await expect(unlinkCandidate(CUSTOMER, CANDIDATE, JOBS)).resolves.toBeUndefined();
    expect(db.calls).toEqual([
      ["from", "applications"],
      ["delete"],
      ["eq", "customer_id", CUSTOMER],
      ["eq", "candidate_id", CANDIDATE],
      ["in", "job_id", JOBS],
    ]);
  });

  it("sends nothing when no job is removed", async () => {
    await unlinkCandidate(CUSTOMER, CANDIDATE, []);
    expect(db.calls).toEqual([]);
  });

  it("fails with the database error", async () => {
    db.result.error = { code: "42501", message: "permission denied" };
    await expect(unlinkCandidate(CUSTOMER, CANDIDATE, JOBS)).rejects.toMatchObject({
      code: "42501",
    });
  });
});
