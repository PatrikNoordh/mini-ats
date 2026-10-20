import { z } from "zod";

import type { Job, Stage } from "@/types";
import { MS_PER_DAY } from "./constants";

/** The pipeline stages in board order. The same values as the check on `applications.stage`. */
export const stageSchema = z.enum(["new", "screening", "interview", "offer", "hired", "rejected"]);

export const STAGES: Stage[] = [...stageSchema.options];

/** Whole days since the given ISO date (never negative). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

/**
 * Same rule as the `candidates.linkedin_url` check in the database
 * (`~* '^https?://([a-z]+\.)?linkedin\.com/'`), so the form never accepts
 * a URL that the database would reject.
 */
const LINKEDIN_URL_PATTERN = /^https?:\/\/([a-z]+\.)?linkedin\.com\//i;

export function isLinkedInUrl(value: string): boolean {
  return LINKEDIN_URL_PATTERN.test(value);
}

/**
 * The `?job=` filter only applies to a job of the active customer. After a
 * customer switch it points at the previous customer's job, so it is dropped.
 * While the jobs are still loading the filter is kept as it is.
 */
export function resolveJobFilter(
  job: string | undefined,
  jobs: readonly Pick<Job, "id">[] | undefined,
): string | undefined {
  if (!job || !jobs) return job;
  return jobs.some((j) => j.id === job) ? job : undefined;
}

export const queryKeys = {
  profiles: () => ["profiles"] as const,
  jobs: (customerId: string | null) => ["jobs", customerId] as const,
  candidates: (customerId: string | null) => ["candidates", customerId] as const,
  applications: (customerId: string | null) => ["applications", customerId] as const,
};
