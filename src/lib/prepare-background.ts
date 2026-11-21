import {
  BACKGROUND_MAX_EDGE_PX,
  BACKGROUND_WEBP_QUALITY,
  MAX_BRANDING_IMAGE_BYTES,
  SURFACE_FLOOR_SAMPLE_EDGE_PX,
} from "@/lib/constants";
import { rgb8ToLinear, type LinearRgb } from "@/lib/contrast";
import { surfaceFloor } from "@/lib/theme";
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

/** A prepared background: the file to upload and the floor measured from it (ATS-66). */
export interface PreparedBackground {
  file: File;
  floor: number;
}

/**
 * The image's areas as linear colours: it is drawn small, SURFACE_FLOOR_SAMPLE_EDGE_PX on its
 * longest side, which averages each area as the chips' blur does. Null if the browser cannot
 * draw it.
 */
function sampleAreas(image: CanvasImageSource, width: number, height: number): LinearRgb[] | null {
  const size = fittedSize(width, height, SURFACE_FLOOR_SAMPLE_EDGE_PX);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);
  const { data } = context.getImageData(0, 0, size.width, size.height);
  const areas: LinearRgb[] = [];
  for (let i = 0; i < data.length; i += 4)
    areas.push(rgb8ToLinear(data[i]!, data[i + 1]!, data[i + 2]!));
  return areas;
}

/**
 * The floor of an image already uploaded, for a background from before ATS-66 that was never
 * measured. Null if it cannot be read, which keeps its chips fully solid.
 */
export async function measureBackgroundFloor(image: Blob): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(image);
    const areas = sampleAreas(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return areas ? surfaceFloor(areas) : null;
  } catch {
    return null;
  }
}

/**
 * A background image made ready for upload (ATS-55): decoded, drawn at most
 * BACKGROUND_MAX_EDGE_PX on its longest side and saved as WebP, or as JPEG in a browser that
 * cannot write WebP. Drawing it again drops its metadata. The chips' floor is measured from the
 * same drawing (ATS-66). Returns the file and its floor, or the validation key that says why it
 * cannot be used.
 */
export async function prepareBackground(file: File): Promise<PreparedBackground | ValidationKey> {
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
  const areas = sampleAreas(canvas, width, height);
  if (!areas) return "image_unreadable";
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
  const name = type === WEBP ? "background.webp" : "background.jpg";
  return { file: new File([encoded], name, { type }), floor: surfaceFloor(areas) };
}
