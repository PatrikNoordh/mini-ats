import type { Candidate } from "@/types";

/** A candidate that looks like the one being added, and what matched. */
export interface LikelyDuplicate {
  candidate: Candidate;
  match: "email" | "name";
}

/** Case and spaces aside: "  Anna  Svensson " and "anna svensson" are the same name. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * The customer's candidate that the form most likely duplicates (ATS-57): one with the same
 * email first, as the stronger sign, then one with the same name. Empty fields match nothing.
 * Only a warning for the recruiter: two people may share a name, so saving is never blocked.
 */
export function findLikelyDuplicate(
  candidates: readonly Candidate[],
  form: { full_name: string; email: string },
): LikelyDuplicate | null {
  const email = normalise(form.email);
  if (email) {
    const byEmail = candidates.find((c) => normalise(c.email) === email);
    if (byEmail) return { candidate: byEmail, match: "email" };
  }
  const name = normalise(form.full_name);
  if (name) {
    const byName = candidates.find((c) => normalise(c.full_name) === name);
    if (byName) return { candidate: byName, match: "name" };
  }
  return null;
}
