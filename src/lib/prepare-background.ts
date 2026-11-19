import {
  BACKGROUND_MAX_EDGE_PX,
  BACKGROUND_WEBP_QUALITY,
  MAX_BRANDING_IMAGE_BYTES,
} from "@/lib/constants";
import type { ValidationKey } from "@/lib/validation";

/** The file type a background is saved as, and the one to fall back to where WebP is missing. */
const WEBP = "image/webp";
const JPEG = "image/jpeg";

/** The size to draw an image at: at most `maxEdge` on its longest side, never larger than it is. */
export function fittedSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * A background image made ready for upload (ATS-55): decoded, drawn at most
 * BACKGROUND_MAX_EDGE_PX on its longest side and saved as WebP, or as JPEG in a browser that
 * cannot write WebP. Drawing it again drops its metadata. Returns the file, or the validation key
 * that says why it cannot be used.
 */
export async function prepareBackground(file: File): Promise<File | ValidationKey> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "image_unreadable";
  }
  const { width, height } = fittedSize(bitmap.width, bitmap.height, BACKGROUND_MAX_EDGE_PX);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "image_unreadable";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, WEBP, BACKGROUND_WEBP_QUALITY),
  );
  if (!blob) return "image_unreadable";
  // A browser without a WebP encoder gives PNG instead, which can be far larger.
  const type = blob.type === WEBP ? WEBP : JPEG;
  const encoded =
    type === WEBP
      ? blob
      : await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, JPEG, BACKGROUND_WEBP_QUALITY),
        );
  if (!encoded) return "image_unreadable";
  if (encoded.size > MAX_BRANDING_IMAGE_BYTES) return "branding_image_too_large";
  return new File([encoded], type === WEBP ? "background.webp" : "background.jpg", { type });
}
