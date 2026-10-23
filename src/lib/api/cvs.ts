import { supabase } from "@/integrations/supabase/client";
import { CV_SIGNED_URL_SECONDS } from "@/lib/constants";
import { AppError } from "@/lib/errors";

/** The private bucket for CVs. Its policies allow only the customer's own folder, or an admin. */
const CV_BUCKET = "cvs";

/** Storage's own codes for a file over the size limit, a type not allowed, and no such file. */
const STORAGE_TOO_LARGE = "413";
const STORAGE_WRONG_TYPE = "415";
const STORAGE_NOT_FOUND = "404";

/**
 * Where a candidate's CV lives: `<customer_id>/<candidate_id>.pdf`. The folder is the customer,
 * which the storage policies and the check on candidates.cv_path both require.
 */
export function cvPath(customerId: string, candidateId: string): string {
  return `${customerId}/${candidateId}.pdf`;
}

/** A Storage error as an AppError when its code is one the UI knows, otherwise as it is. */
export function fromStorageError(error: Error): unknown {
  const statusCode = "statusCode" in error ? String(error.statusCode) : "";
  if (statusCode === STORAGE_TOO_LARGE) return new AppError("cv_too_large");
  if (statusCode === STORAGE_WRONG_TYPE) return new AppError("cv_not_pdf");
  if (statusCode === STORAGE_NOT_FOUND) return new AppError("cv_not_found");
  return error;
}

/**
 * Uploads a CV file, replacing the file at that path. The bucket checks size and type on the
 * server too, so a file the form should have stopped is still refused.
 */
export async function uploadCvFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw fromStorageError(error);
}

/** Removes a CV file. A file that is already gone is not an error. */
export async function removeCvFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(CV_BUCKET).remove([path]);
  if (error) throw fromStorageError(error);
}

/**
 * A link that opens the CV for CV_SIGNED_URL_SECONDS. The bucket is private, so this is the only
 * way to open it, and the storage policies decide who gets a link.
 */
export async function cvSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .createSignedUrl(path, CV_SIGNED_URL_SECONDS);
  if (error) throw fromStorageError(error);
  return data.signedUrl;
}
