import { describe, expect, it } from "vitest";

import { addApplicationError } from "@/lib/api/applications";
import { PG_UNIQUE_VIOLATION } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { jobsToAdd } from "@/lib/stages";

function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe("adding a candidate to a job", () => {
  it("says already_linked when the candidate is already on the job", () => {
    const error = dbError(PG_UNIQUE_VIOLATION, "duplicate key value violates unique constraint");
    expect(errorCode(addApplicationError(error))).toBe("already_linked");
  });

  it("keeps the trigger code when the job belongs to another customer", () => {
    const error = dbError("P0001", "job_candidate_customer_mismatch");
    expect(errorCode(addApplicationError(error))).toBe("job_candidate_customer_mismatch");
  });

  it("leaves other failures as unknown", () => {
    expect(errorCode(addApplicationError(dbError("08006", "connection failure")))).toBe("unknown");
  });
});

describe("jobs a candidate can be added to", () => {
  const jobs = [
    { id: "j1", status: "open" as const },
    { id: "j2", status: "open" as const },
    { id: "j3", status: "closed" as const },
  ];

  it("offers the open jobs the candidate is not linked to", () => {
    const applications = [{ job_id: "j1", candidate_id: "c1" }];
    expect(jobsToAdd(jobs, applications, "c1").map((j) => j.id)).toEqual(["j2"]);
  });

  it("ignores other candidates' links", () => {
    const applications = [{ job_id: "j1", candidate_id: "c2" }];
    expect(jobsToAdd(jobs, applications, "c1").map((j) => j.id)).toEqual(["j1", "j2"]);
  });

  it("offers nothing when the candidate is on every open job", () => {
    const applications = [
      { job_id: "j1", candidate_id: "c1" },
      { job_id: "j2", candidate_id: "c1" },
    ];
    expect(jobsToAdd(jobs, applications, "c1")).toEqual([]);
  });
});
