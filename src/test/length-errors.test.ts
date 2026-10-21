import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCandidate, updateCandidate } from "@/lib/api/candidates";
import { createJob, updateJob } from "@/lib/api/jobs";
import { PG_CHECK_VIOLATION } from "@/lib/constants";
import { errorCode, fromWriteError } from "@/lib/errors";

// What PostgREST returns when a check constraint refuses a write.
const checkError = (constraint: string) => ({
  code: PG_CHECK_VIOLATION,
  message: `new row for relation "jobs" violates check constraint "${constraint}"`,
});

describe("a text over its database length limit", () => {
  it("becomes text_too_long", () => {
    expect(errorCode(fromWriteError(checkError("jobs_title_length")))).toBe("text_too_long");
    expect(errorCode(fromWriteError(checkError("candidates_notes_length")))).toBe("text_too_long");
  });

  it("leaves other check violations and errors as they are", () => {
    const linkedin = checkError("candidates_linkedin_url_check");
    expect(fromWriteError(linkedin)).toBe(linkedin);
    const other = { code: "23505", message: 'duplicate key "jobs_title_length"' };
    expect(fromWriteError(other)).toBe(other);
  });
});

// The writes return { error } from the query builder chain, ending in single() or maybeSingle().
const db = vi.hoisted(() => {
  const result: { data: unknown; error: unknown } = { data: null, error: null };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "insert", "update", "eq", "select"])
    builder[method] = () => builder;
  builder["single"] = () => Promise.resolve(result);
  builder["maybeSingle"] = () => Promise.resolve(result);
  return { result, builder };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: db.builder }));

describe("job and candidate writes", () => {
  beforeEach(() => {
    db.result.data = null;
    db.result.error = checkError("jobs_title_length");
  });

  const job = { title: "x", location: "y", description: "" };
  const candidate = { full_name: "x", email: "a@b.se", phone: "", linkedin_url: "", notes: "" };

  it.each([
    ["createJob", () => createJob("c1", job)],
    ["updateJob", () => updateJob("c1", "j1", job)],
    ["createCandidate", () => createCandidate("c1", candidate)],
    ["updateCandidate", () => updateCandidate("c1", "k1", candidate)],
  ])("%s reports a refused length as text_too_long", async (_, write) => {
    await expect(write()).rejects.toMatchObject({ code: "text_too_long" });
  });
});
