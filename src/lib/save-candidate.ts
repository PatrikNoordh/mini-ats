import { linkCandidate, unlinkCandidate } from "@/lib/api/applications";
import { createCandidate, updateCandidate } from "@/lib/api/candidates";
import { AppError } from "@/lib/errors";
import type { CandidateInput } from "@/lib/validation";
import type { Candidate } from "@/types";

export interface SaveCandidateVars {
  id?: string | undefined;
  input: CandidateInput;
  /** Jobs to link the candidate to. */
  newJobIds: string[];
  /** Jobs to unlink the candidate from: their cards are removed. */
  removedJobIds?: string[] | undefined;
}

/**
 * Saves the candidate, then links it to the new jobs and unlinks it from the removed ones. These
 * are separate requests: the candidate is already saved when a link step fails, and the error says
 * which step (`links_failed` or `unlinks_failed`) so the form can say so.
 */
export async function saveCandidate(
  customerId: string,
  { id, input, newJobIds, removedJobIds = [] }: SaveCandidateVars,
): Promise<Candidate> {
  const candidate = id
    ? await updateCandidate(customerId, id, input)
    : await createCandidate(customerId, input);
  try {
    await linkCandidate(candidate.id, newJobIds);
  } catch {
    throw new AppError("links_failed");
  }
  try {
    await unlinkCandidate(customerId, candidate.id, removedJobIds);
  } catch {
    throw new AppError("unlinks_failed");
  }
  return candidate;
}
