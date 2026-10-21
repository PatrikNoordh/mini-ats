import { linkCandidate } from "@/lib/api/applications";
import { createCandidate, updateCandidate } from "@/lib/api/candidates";
import { AppError } from "@/lib/errors";
import type { CandidateInput } from "@/lib/validation";
import type { Candidate } from "@/types";

export interface SaveCandidateVars {
  id?: string | undefined;
  input: CandidateInput;
  /** Jobs to link the candidate to. Existing links are kept and never removed here. */
  newJobIds: string[];
}

/**
 * Saves the candidate, then links it to the new jobs. These are two requests: if the links fail,
 * the candidate is already saved, and the error is `links_failed` so the form can say so.
 */
export async function saveCandidate(
  customerId: string,
  { id, input, newJobIds }: SaveCandidateVars,
): Promise<Candidate> {
  const candidate = id
    ? await updateCandidate(customerId, id, input)
    : await createCandidate(customerId, input);
  try {
    await linkCandidate(candidate.id, newJobIds);
  } catch {
    throw new AppError("links_failed");
  }
  return candidate;
}
