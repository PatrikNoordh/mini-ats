import { beforeEach, describe, expect, it, vi } from "vitest";

import { cvPath, fromStorageError } from "@/lib/api/cvs";
import { removeCandidateCv, uploadCandidateCv } from "@/lib/candidate-cv";
import { MAX_CV_BYTES } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { getI18n } from "@/lib/i18n";
import { cvFileError } from "@/lib/validation";

// Storage calls and the candidates update().eq().eq().select().maybeSingle() chain, recorded.
const db = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const results: {
    upload: { error: unknown };
    remove: { error: unknown };
    update: { data: unknown; error: unknown };
  } = { upload: { error: null }, remove: { error: null }, update: { data: null, error: null } };
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "update", "eq", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder["maybeSingle"] = () => Promise.resolve(results.update);
  const storage = {
    from: (bucket: string) => ({
      upload: (path: string, _file: File, options: unknown) => {
        calls.push(["upload", bucket, path, options]);
        return Promise.resolve({ data: null, error: results.upload.error });
      },
      remove: (paths: string[]) => {
        calls.push(["remove", bucket, paths]);
        return Promise.resolve({ data: [], error: results.remove.error });
      },
    }),
  };
  return { calls, results, builder, storage };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { ...db.builder, storage: db.storage },
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const CANDIDATE = "20000000-0000-0000-0000-0000000000a1";
const PATH = `${CUSTOMER}/${CANDIDATE}.pdf`;
const pdf = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });

/** A Storage error as supabase-js gives it: the service's code is a string in statusCode. */
const storageError = (statusCode: string) =>
  Object.assign(new Error("refused"), { status: 400, statusCode });

describe("CV path", () => {
  it("is the candidate's id in the customer's folder", () => {
    expect(cvPath(CUSTOMER, CANDIDATE)).toBe(PATH);
  });
});

describe("CV file check", () => {
  it("accepts a PDF up to the limit", () => {
    expect(cvFileError({ type: "application/pdf", size: 1 })).toBeNull();
    expect(cvFileError({ type: "application/pdf", size: MAX_CV_BYTES })).toBeNull();
  });

  it("refuses another type, an empty file and a file over the limit", () => {
    expect(cvFileError({ type: "image/png", size: 10 })).toBe("cv_not_pdf");
    expect(cvFileError({ type: "", size: 10 })).toBe("cv_not_pdf");
    expect(cvFileError({ type: "application/pdf", size: 0 })).toBe("cv_empty");
    expect(cvFileError({ type: "application/pdf", size: MAX_CV_BYTES + 1 })).toBe("cv_too_large");
  });

  it("names the limit in megabytes in both languages", () => {
    expect(getI18n("sv").t("errors.cv_too_large")).toBe("CV:t får vara högst 5 MB.");
    expect(getI18n("en").t("errors.cv_too_large")).toBe("The CV can be at most 5 MB.");
  });
});

describe("Storage errors", () => {
  it("turns the bucket's refusals into codes and passes others on", () => {
    expect(fromStorageError(storageError("413"))).toMatchObject({ code: "cv_too_large" });
    expect(fromStorageError(storageError("415"))).toMatchObject({ code: "cv_not_pdf" });
    expect(fromStorageError(storageError("404"))).toMatchObject({ code: "cv_not_found" });
    const other = storageError("500");
    expect(fromStorageError(other)).toBe(other);
  });
});

describe("uploading a CV", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.results.upload.error = null;
    db.results.remove.error = null;
    db.results.update = { data: { id: CANDIDATE }, error: null };
  });

  it("replaces the file at the fixed path, then points the candidate at it", async () => {
    await uploadCandidateCv(CUSTOMER, CANDIDATE, pdf);
    expect(db.calls[0]).toEqual([
      "upload",
      "cvs",
      PATH,
      { upsert: true, contentType: "application/pdf" },
    ]);
    expect(db.calls).toContainEqual(["update", { cv_path: PATH }]);
    expect(db.calls).toContainEqual(["eq", "customer_id", CUSTOMER]);
  });

  it("saves nothing when the bucket refuses the file", async () => {
    db.results.upload.error = storageError("413");
    await expect(uploadCandidateCv(CUSTOMER, CANDIDATE, pdf)).rejects.toMatchObject({
      code: "cv_too_large",
    });
    expect(db.calls).not.toContainEqual(["from", "candidates"]);
  });

  it("removes the file again when the candidate is not there for this customer", async () => {
    db.results.update = { data: null, error: null };
    await expect(uploadCandidateCv(CUSTOMER, CANDIDATE, pdf)).rejects.toEqual(
      new AppError("candidate_not_found"),
    );
    expect(db.calls.at(-1)).toEqual(["remove", "cvs", [PATH]]);
  });
});

describe("removing a CV", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.results.remove.error = null;
    db.results.update = { data: { id: CANDIDATE }, error: null };
  });

  it("removes the file first, then clears the candidate's path", async () => {
    await removeCandidateCv(CUSTOMER, CANDIDATE);
    expect(db.calls[0]).toEqual(["remove", "cvs", [PATH]]);
    expect(db.calls).toContainEqual(["update", { cv_path: null }]);
  });

  it("keeps the path when the file cannot be removed", async () => {
    const error = new Error("storage down");
    db.results.remove.error = error;
    await expect(removeCandidateCv(CUSTOMER, CANDIDATE)).rejects.toBe(error);
    expect(db.calls).not.toContainEqual(["update", { cv_path: null }]);
  });
});
