import { beforeEach, describe, expect, it, vi } from "vitest";

import { linkCandidate, parseApplicationRow } from "@/lib/api/applications";
import { createCandidate, parseCandidateRow, updateCandidate } from "@/lib/api/candidates";
import { MAX_NAME_LENGTH } from "@/lib/constants";
import { AppError, errorCode, fromDbError } from "@/lib/errors";
import { stageSchema, STAGES } from "@/lib/stages";
import { candidateInputSchema, fieldErrors } from "@/lib/validation";
import { saveCandidate } from "@/hooks/useCandidates";
import type { Candidate } from "@/types";

vi.mock("@/lib/api/candidates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/candidates")>()),
  createCandidate: vi.fn(),
  updateCandidate: vi.fn(),
}));
vi.mock("@/lib/api/applications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/applications")>()),
  linkCandidate: vi.fn(),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";

const candidateRow = {
  id: "20000000-0000-0000-0000-0000000000a1",
  customer_id: CUSTOMER,
  full_name: "Alva Provsson",
  email: "alva@exempel.test",
  phone: "070-000 00 10",
  linkedin_url: "https://www.linkedin.com/in/alva-exempel",
  notes: "Stark referens.",
  created_at: "2026-10-20T08:00:00+00:00",
};

describe("candidate row", () => {
  it("reads the candidate and shows missing details as empty text", () => {
    expect(parseCandidateRow(candidateRow)).toEqual(candidateRow);
    expect(
      parseCandidateRow({
        ...candidateRow,
        email: null,
        phone: null,
        linkedin_url: null,
        notes: null,
      }),
    ).toMatchObject({ email: "", phone: "", linkedin_url: "", notes: "" });
  });
});

describe("application row", () => {
  const row = {
    id: "30000000-0000-0000-0000-0000000000a1",
    customer_id: CUSTOMER,
    job_id: "10000000-0000-0000-0000-0000000000a1",
    candidate_id: candidateRow.id,
    stage: "screening",
    position: 2,
    stage_changed_at: "2026-10-18T08:00:00+00:00",
    created_at: "2026-10-10T08:00:00+00:00",
    updated_at: "2026-10-18T08:00:00+00:00",
  };

  it("reads the application", () => {
    expect(parseApplicationRow(row)).toEqual(row);
  });

  it("rejects a stage the app does not know", () => {
    expect(() => parseApplicationRow({ ...row, stage: "archived" })).toThrow();
  });

  it("knows the same stages as the board, in board order", () => {
    expect(STAGES).toEqual(stageSchema.options);
    expect(STAGES).toEqual(["new", "screening", "interview", "offer", "hired", "rejected"]);
  });
});

describe("database errors", () => {
  it("turns a trigger code into an AppError", () => {
    expect(errorCode(fromDbError(new Error("job_candidate_customer_mismatch")))).toBe(
      "job_candidate_customer_mismatch",
    );
  });

  it("leaves other errors as unknown", () => {
    expect(errorCode(fromDbError(new Error("duplicate key value")))).toBe("unknown");
  });
});

describe("candidate form", () => {
  const input = {
    full_name: "Alva Provsson",
    email: "alva@exempel.test",
    phone: "",
    linkedin_url: "",
    notes: "",
  };

  it("trims every field", () => {
    expect(
      candidateInputSchema.parse({
        full_name: " Alva ",
        email: " alva@exempel.test ",
        phone: " 070 ",
        linkedin_url: " https://linkedin.com/in/alva ",
        notes: " x ",
      }),
    ).toEqual({
      full_name: "Alva",
      email: "alva@exempel.test",
      phone: "070",
      linkedin_url: "https://linkedin.com/in/alva",
      notes: "x",
    });
  });

  it("accepts an empty phone, LinkedIn URL and notes", () => {
    expect(candidateInputSchema.safeParse(input).success).toBe(true);
  });

  it("requires a name and a valid email", () => {
    const result = candidateInputSchema.safeParse({ ...input, full_name: "  ", email: "alva" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      full_name: "name_required",
      email: "email_invalid",
    });
  });

  it("rejects a URL that is not a LinkedIn profile", () => {
    const result = candidateInputSchema.safeParse({
      ...input,
      linkedin_url: "https://linkedin.com.evil.test/in/alva",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({ linkedin_url: "linkedin_invalid" });
  });

  it("rejects a name that is too long", () => {
    const result = candidateInputSchema.safeParse({
      ...input,
      full_name: "a".repeat(MAX_NAME_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({ full_name: "too_long" });
  });
});

describe("saving a candidate", () => {
  const candidate: Candidate = parseCandidateRow(candidateRow);
  const input = {
    full_name: candidate.full_name,
    email: candidate.email,
    phone: "",
    linkedin_url: "",
    notes: "",
  };
  const jobId = "10000000-0000-0000-0000-0000000000a1";

  beforeEach(() => {
    vi.mocked(createCandidate).mockReset().mockResolvedValue(candidate);
    vi.mocked(updateCandidate).mockReset().mockResolvedValue(candidate);
    vi.mocked(linkCandidate).mockReset().mockResolvedValue();
  });

  it("creates the candidate, then links the new candidate to the chosen jobs", async () => {
    await expect(saveCandidate(CUSTOMER, { input, newJobIds: [jobId] })).resolves.toBe(candidate);
    expect(createCandidate).toHaveBeenCalledWith(CUSTOMER, input);
    expect(linkCandidate).toHaveBeenCalledWith(CUSTOMER, candidate.id, [jobId]);
  });

  it("updates an existing candidate", async () => {
    await saveCandidate(CUSTOMER, { id: candidate.id, input, newJobIds: [] });
    expect(updateCandidate).toHaveBeenCalledWith(CUSTOMER, candidate.id, input);
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it("says links_failed when the candidate is saved but the links fail", async () => {
    vi.mocked(linkCandidate).mockRejectedValue(new AppError("job_candidate_customer_mismatch"));
    const result = saveCandidate(CUSTOMER, { input, newJobIds: [jobId] });
    await expect(result).rejects.toEqual(new AppError("links_failed"));
    expect(createCandidate).toHaveBeenCalledTimes(1);
  });

  it("does not try to link when saving the candidate fails", async () => {
    vi.mocked(createCandidate).mockRejectedValue(new Error("network"));
    await expect(saveCandidate(CUSTOMER, { input, newJobIds: [jobId] })).rejects.toThrow("network");
    expect(linkCandidate).not.toHaveBeenCalled();
  });
});
