import type { Stage } from "@/types";

export const STAGES: Stage[] = ["new", "screening", "interview", "offer", "hired", "rejected"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "Ny",
  screening: "Screening",
  interview: "Intervju",
  offer: "Erbjudande",
  hired: "Anställd",
  rejected: "Avböjd",
};

/** Whole days since the given ISO date (never negative). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
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

export const queryKeys = {
  profiles: () => ["profiles"] as const,
  jobs: (customerId: string | null) => ["jobs", customerId] as const,
  candidates: (customerId: string | null) => ["candidates", customerId] as const,
  applications: (customerId: string | null) => ["applications", customerId] as const,
};
