import { linkCandidate, unlinkCandidate } from "@/lib/api/applications";
import { createCandidate, updateCandidate } from "@/lib/api/candidates";
import { uploadCandidateCv } from "@/lib/candidate-cv";
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
  /** A CV to upload, replacing any CV the candidate has (ATS-17). Checked by the form first. */
  cvFile?: File | null | undefined;
}

/**
 * Saves the candidate, then links it to the new jobs, unlinks it from the removed ones and
 * uploads its CV. The upload needs the candidate's id, so a new candidate is saved first. These
 * are separate requests: the candidate is already saved when a later step fails, and the error
 * says which step (`links_failed`, `unlinks_failed` or `cv_upload_failed`) so the form can say
 * so. Every step runs even if another fails, so a failed link never silently skips the rest.
 */
export async function saveCandidate(
  customerId: string,
  { id, input, newJobIds, removedJobIds = [], cvFile }: SaveCandidateVars,
): Promise<Candidate> {
  const candidate = id
    ? await updateCandidate(customerId, id, input)
    : await createCandidate(customerId, input);
  const [linked, unlinked, uploaded] = await Promise.allSettled([
    linkCandidate(candidate.id, newJobIds),
    unlinkCandidate(customerId, candidate.id, removedJobIds),
    cvFile ? uploadCandidateCv(customerId, candidate.id, cvFile) : Promise.resolve(),
  ]);
  if (linked.status === "rejected") throw new AppError("links_failed");
  if (unlinked.status === "rejected") throw new AppError("unlinks_failed");
  if (uploaded.status === "rejected") throw new AppError("cv_upload_failed");
  return candidate;
}
