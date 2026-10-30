import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assessCv,
  isFromEarlierCv,
  latestByApplication,
  listAssessments,
  parseAssessmentRow,
} from "@/lib/api/assessments";
import { invokeFunction } from "@/lib/api/functions";
import { AppError, errorCode } from "@/lib/errors";
import type { CvAssessment } from "@/types";

// The query builder chain from().select().eq().in().order(), recording every call.
const db = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const result: { data: unknown; error: unknown } = { data: [], error: null };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "select", "eq", "in"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder["order"] = (...args: unknown[]) => {
    calls.push(["order", ...args]);
    return Promise.resolve(result);
  };
  return { calls, result, builder };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: db.builder }));
vi.mock("@/lib/api/functions", () => ({ invokeFunction: vi.fn() }));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const row = {
  id: "s1",
  application_id: "app1",
  score: 7,
  summary: "Bra matchning.",
  strengths: ["Figma"],
  gaps: [],
  created_at: "2026-10-23T12:00:00Z",
};
const assessment = (id: string, applicationId: string): CvAssessment => ({
  ...row,
  id,
  application_id: applicationId,
});

describe("assessment rows", () => {
  it("reads a row, and a missing summary becomes empty text", () => {
    expect(parseAssessmentRow(row)).toEqual(row);
    expect(parseAssessmentRow({ ...row, summary: null }).summary).toBe("");
  });

  it("refuses a row that is not an assessment", () => {
    expect(() => parseAssessmentRow({ ...row, strengths: "Figma" })).toThrow();
  });

  it("keeps the newest assessment of each application from a newest-first list", () => {
    const latest = latestByApplication([
      assessment("new1", "app1"),
      assessment("new2", "app2"),
      assessment("old1", "app1"),
    ]);
    expect(latest.get("app1")?.id).toBe("new1");
    expect(latest.get("app2")?.id).toBe("new2");
    expect(latest.size).toBe(2);
  });

  it("marks an assessment older than the current CV as made from an earlier CV", () => {
    const made = { created_at: "2026-10-23T12:00:00Z" };
    expect(isFromEarlierCv(made, { cv_uploaded_at: "2026-10-24T08:00:00Z" })).toBe(true);
    expect(isFromEarlierCv(made, { cv_uploaded_at: "2026-10-22T08:00:00Z" })).toBe(false);
    expect(isFromEarlierCv(made, { cv_uploaded_at: null })).toBe(false);
  });
});

describe("listing assessments", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result.data = [row];
    db.result.error = null;
  });

  it("asks for nothing without applications", async () => {
    await expect(listAssessments(CUSTOMER, [])).resolves.toEqual([]);
    expect(db.calls).toEqual([]);
  });

  it("lists the applications' assessments for the customer, newest first", async () => {
    await expect(listAssessments(CUSTOMER, ["app1", "app2"])).resolves.toEqual([row]);
    expect(db.calls).toContainEqual(["from", "cv_assessments"]);
    expect(db.calls).toContainEqual(["eq", "customer_id", CUSTOMER]);
    expect(db.calls).toContainEqual(["in", "application_id", ["app1", "app2"]]);
    expect(db.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });
});

describe("asking for an assessment", () => {
  beforeEach(() => {
    vi.mocked(invokeFunction).mockReset();
  });

  it("calls assess-cv with the application and the language, and reads the saved row", async () => {
    vi.mocked(invokeFunction).mockResolvedValue({ assessment: { ...row, model: "m" } });
    await expect(assessCv("app1", "sv")).resolves.toEqual(row);
    expect(invokeFunction).toHaveBeenCalledWith("assess-cv", {
      application_id: "app1",
      language: "sv",
    });
  });

  it("passes the function's codes on", async () => {
    vi.mocked(invokeFunction).mockRejectedValue(new AppError("cv_no_text"));
    await expect(assessCv("app1", "en")).rejects.toSatisfy((e) => errorCode(e) === "cv_no_text");
  });
});
