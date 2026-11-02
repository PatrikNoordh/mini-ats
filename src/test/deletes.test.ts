import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCandidate } from "@/lib/api/candidates";
import { deleteJob } from "@/lib/api/jobs";
import { PG_FOREIGN_KEY_VIOLATION } from "@/lib/constants";
import { AppError } from "@/lib/errors";

// The query builder chains delete() and update() ….eq().eq().select().maybeSingle(), recording
// every call.
const db = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const result: { data: unknown; error: unknown } = { data: null, error: null };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "delete", "update", "eq", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder["maybeSingle"] = () => Promise.resolve(result);
  return { calls, result, builder };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: db.builder }));

const invokeFunction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/functions", () => ({ invokeFunction }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const ID = "10000000-0000-0000-0000-0000000000a1";

describe("deleting", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result.data = { id: ID };
    db.result.error = null;
    invokeFunction.mockReset();
  });

  it("deletes a job scoped to the customer", async () => {
    await expect(deleteJob(CUSTOMER, ID)).resolves.toBeUndefined();
    expect(db.calls).toContainEqual(["from", "jobs"]);
    expect(db.calls).toContainEqual(["eq", "id", ID]);
    expect(db.calls).toContainEqual(["eq", "customer_id", CUSTOMER]);
  });

  it("turns the foreign key refusal into job_has_candidates", async () => {
    db.result.data = null;
    db.result.error = { code: PG_FOREIGN_KEY_VIOLATION, message: "violates foreign key" };
    await expect(deleteJob(CUSTOMER, ID)).rejects.toMatchObject({ code: "job_has_candidates" });
  });

  it("reports a job that is not there for this customer as job_not_found", async () => {
    db.result.data = null;
    await expect(deleteJob(CUSTOMER, ID)).rejects.toMatchObject({ code: "job_not_found" });
  });

  it("passes other database errors on, so they show as unknown", async () => {
    const error = { code: "57014", message: "canceled" };
    db.result.data = null;
    db.result.error = error;
    await expect(deleteJob(CUSTOMER, ID)).rejects.toBe(error);
  });

  it("deletes a candidate in one call to delete-candidate, which removes the CV file too", async () => {
    invokeFunction.mockResolvedValue({ deleted: ID });
    await expect(deleteCandidate(ID)).resolves.toBeUndefined();
    expect(invokeFunction).toHaveBeenCalledExactlyOnceWith("delete-candidate", {
      candidate_id: ID,
    });
    // Nothing is deleted or removed from the browser itself (ATS-56).
    expect(db.calls).toEqual([]);
  });

  it("passes the function's code on, such as candidate_not_found", async () => {
    invokeFunction.mockRejectedValue(new AppError("candidate_not_found"));
    await expect(deleteCandidate(ID)).rejects.toMatchObject({ code: "candidate_not_found" });
  });
});
