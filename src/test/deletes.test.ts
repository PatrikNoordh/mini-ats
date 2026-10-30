import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCandidate } from "@/lib/api/candidates";
import { deleteJob } from "@/lib/api/jobs";
import { PG_FOREIGN_KEY_VIOLATION } from "@/lib/constants";

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
  // Removing the candidate's CV file (ATS-17).
  const storageResult: { error: unknown } = { error: null };
  const storage = {
    from: (bucket: string) => ({
      remove: (paths: string[]) => {
        calls.push(["remove", bucket, paths]);
        return Promise.resolve({ data: [], error: storageResult.error });
      },
    }),
  };
  return { calls, result, builder, storage, storageResult };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { ...db.builder, storage: db.storage },
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const ID = "10000000-0000-0000-0000-0000000000a1";

describe("deleting", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result.data = { id: ID };
    db.result.error = null;
    db.storageResult.error = null;
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

  it("deletes a candidate scoped to the customer, removing its CV file first", async () => {
    await expect(deleteCandidate(CUSTOMER, ID)).resolves.toBeUndefined();
    expect(db.calls[0]).toEqual(["remove", "cvs", [`${CUSTOMER}/${ID}.pdf`]]);
    expect(db.calls).toContainEqual(["from", "candidates"]);
    expect(db.calls).toContainEqual(["eq", "customer_id", CUSTOMER]);
  });

  it("deletes no candidate when its CV file cannot be removed", async () => {
    const error = new Error("storage down");
    db.storageResult.error = error;
    await expect(deleteCandidate(CUSTOMER, ID)).rejects.toBe(error);
    expect(db.calls).not.toContainEqual(["from", "candidates"]);
  });

  it("clears the CV path when the file is removed but the candidate can't be deleted", async () => {
    const error = { code: "57014", message: "canceling statement due to statement timeout" };
    db.result.error = error;
    await expect(deleteCandidate(CUSTOMER, ID)).rejects.toBe(error);
    expect(db.calls[0]).toEqual(["remove", "cvs", [`${CUSTOMER}/${ID}.pdf`]]);
    expect(db.calls).toContainEqual(["update", { cv_path: null }]);
  });

  it("does not touch the CV path after a delete that worked", async () => {
    await deleteCandidate(CUSTOMER, ID);
    expect(db.calls.some(([method]) => method === "update")).toBe(false);
  });

  it("reports a candidate that is not there for this customer as candidate_not_found", async () => {
    db.result.data = null;
    await expect(deleteCandidate(CUSTOMER, ID)).rejects.toMatchObject({
      code: "candidate_not_found",
    });
  });
});
