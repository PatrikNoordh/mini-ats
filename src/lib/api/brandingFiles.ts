import { supabase } from "@/integrations/supabase/client";
import { BRANDING_SIGNED_URL_SECONDS } from "@/lib/constants";
import { AppError } from "@/lib/errors";

/**
 * The private bucket for logos and backgrounds (ATS-52). Its policies allow only the company's own
 * folder, or an admin, and it takes PNG, JPEG and WebP up to MAX_BRANDING_IMAGE_BYTES.
 */
const BRANDING_BUCKET = "branding";

/** Storage's own codes for a file over the size limit and a type not allowed. */
const STORAGE_TOO_LARGE = "413";
const STORAGE_WRONG_TYPE = "415";

/**
 * Where a company's logo lives: one fixed path in its folder, so a new logo replaces the old file
 * in the same call and no old logo is left behind. The type is the file's content type.
 */
export function logoPath(customerId: string): string {
  return `${customerId}/logo`;
}

/** Where a company's background image lives (ATS-55), on the same terms as the logo. */
export function backgroundPath(customerId: string): string {
  return `${customerId}/background`;
}

function fromStorageError(error: Error): unknown {
  const statusCode = "statusCode" in error ? String(error.statusCode) : "";
  if (statusCode === STORAGE_TOO_LARGE) return new AppError("branding_image_too_large");
  if (statusCode === STORAGE_WRONG_TYPE) return new AppError("branding_image_type");
  return error;
}

/** Uploads an image, replacing the file at that path. The bucket checks size and type too. */
export async function uploadBrandingFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw fromStorageError(error);
}

/** Removes files. A file that is already gone is not an error. */
export async function removeBrandingFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BRANDING_BUCKET).remove(paths);
  if (error) throw fromStorageError(error);
}

/**
 * Every file in the company's folder. Reset removes them all, also a file a failed save left
 * without a row pointing at it. The folder holds a logo and a background at most, so one page is
 * all of it.
 */
export async function listBrandingFiles(customerId: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).list(customerId);
  if (error) throw fromStorageError(error);
  return data.map((file) => `${customerId}/${file.name}`);
}

/** A link to show the image for BRANDING_SIGNED_URL_SECONDS. The bucket is private. */
export async function brandingSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .createSignedUrl(path, BRANDING_SIGNED_URL_SECONDS);
  if (error) throw fromStorageError(error);
  return data.signedUrl;
}
