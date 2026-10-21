import { describe, expect, it } from "vitest";

import { parseJobListRow, parseJobRow } from "@/lib/api/jobs";
import { MAX_JOB_TITLE_LENGTH } from "@/lib/constants";
import { fieldErrors, jobInputSchema } from "@/lib/validation";

const row = {
  id: "10000000-0000-0000-0000-0000000000a1",
  customer_id: "00000000-0000-0000-0000-0000000000a1",
  title: "Platschef",
  description: "Vi söker en platschef.",
  location: "Göteborg",
  status: "open",
  created_at: "2026-10-20T08:00:00+00:00",
};

describe("job row", () => {
  it("reads the job and shows a missing description and location as empty text", () => {
    expect(parseJobRow(row)).toEqual(row);
    expect(parseJobRow({ ...row, description: null, location: null })).toMatchObject({
      description: "",
      location: "",
    });
  });

  it("rejects a status the app does not know", () => {
    expect(() => parseJobRow({ ...row, status: "archived" })).toThrow();
  });

  it("reads the candidate count from the embedded applications count", () => {
    expect(parseJobListRow({ ...row, applications: [{ count: 3 }] }).candidate_count).toBe(3);
    expect(parseJobListRow({ ...row, applications: [] }).candidate_count).toBe(0);
  });
});

describe("job form", () => {
  const input = { title: "Platschef", location: "Göteborg", description: "" };

  it("trims every field", () => {
    expect(
      jobInputSchema.parse({ title: "  Platschef ", location: " Göteborg", description: " x " }),
    ).toEqual({ title: "Platschef", location: "Göteborg", description: "x" });
  });

  it("requires a title and a location, also when they are only spaces", () => {
    const result = jobInputSchema.safeParse({ ...input, title: "   ", location: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(jobInputSchema, result.error)).toEqual({
      title: "title_required",
      location: "location_required",
    });
  });

  it("rejects a title that is too long", () => {
    const result = jobInputSchema.safeParse({
      ...input,
      title: "a".repeat(MAX_JOB_TITLE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(jobInputSchema, result.error)).toEqual({ title: "too_long" });
  });

  it("accepts a title of exactly the maximum length", () => {
    expect(
      jobInputSchema.safeParse({ ...input, title: "a".repeat(MAX_JOB_TITLE_LENGTH) }).success,
    ).toBe(true);
  });
});
