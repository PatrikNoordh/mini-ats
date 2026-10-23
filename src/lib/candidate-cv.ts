import { setCandidateCvPath } from "@/lib/api/candidates";
import { cvPath, removeCvFile, uploadCvFile } from "@/lib/api/cvs";
import { AppError } from "@/lib/errors";

/**
 * Uploads a candidate's CV and points the candidate at it (ATS-17). The path is fixed, so a new
 * CV replaces the old file in the same call. If the candidate does not exist for this customer,
 * the file just uploaded is removed again.
 */
export async function uploadCandidateCv(
  customerId: string,
  candidateId: string,
  file: File,
): Promise<void> {
  const path = cvPath(customerId, candidateId);
  await uploadCvFile(path, file);
  try {
    await setCandidateCvPath(customerId, candidateId, path);
  } catch (error) {
    if (error instanceof AppError && error.code === "candidate_not_found") {
      await removeCvFile(path);
    }
    throw error;
  }
}

/**
 * Removes a candidate's CV. The file goes first and cv_path after, so a failure in between
 * leaves a path to a missing file, which a new try clears, never a file that nobody can see.
 */
export async function removeCandidateCv(customerId: string, candidateId: string): Promise<void> {
  await removeCvFile(cvPath(customerId, candidateId));
  await setCandidateCvPath(customerId, candidateId, null);
}
