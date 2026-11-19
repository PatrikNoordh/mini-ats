import { deleteBranding, saveBranding } from "@/lib/api/customerBranding";
import {
  backgroundPath,
  listBrandingFiles,
  logoPath,
  removeBrandingFiles,
  uploadBrandingFile,
} from "@/lib/api/brandingFiles";
import type { BackgroundDim } from "@/types";

/** What happens to one image, the logo or the background, when the theme is saved. */
export type ImageChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "remove" };

export interface ThemeChange {
  accent: string | null;
  logo: ImageChange;
  background: ImageChange;
  backgroundDim: BackgroundDim;
}

/** The paths the saved theme has now, or null for an image it does not have. */
export interface SavedImages {
  logo: string | null;
  background: string | null;
}

/** Where each image lives: one fixed path per company, so a new file replaces the old one. */
const PATHS = { logo: logoPath, background: backgroundPath } as const;
type Image = keyof typeof PATHS;
const IMAGES: Image[] = ["logo", "background"];

/**
 * Saves a company's theme (ATS-54, ATS-55). Storage and the database share no transaction, so the
 * steps run in the order that leaves the least behind, as for a CV (docs/data-safety.md § 4):
 * 1. An image to remove goes first, so a failure later leaves a path to a missing file, which the
 *    app shows as no image and a new save clears, never a file that nobody can see.
 * 2. A new image is uploaded to its fixed path.
 * 3. The row is saved. If that fails, an image just added where there was none is removed again;
 *    one that replaced an image stays, since the path still names it.
 */
export async function saveTheme(
  customerId: string,
  saved: SavedImages,
  change: ThemeChange,
): Promise<void> {
  const paths: SavedImages = { ...saved };
  const added: string[] = [];
  for (const image of IMAGES) {
    const current = saved[image];
    if (change[image].kind === "remove") {
      if (current) await removeBrandingFiles([current]);
      paths[image] = null;
    }
  }
  for (const image of IMAGES) {
    const imageChange = change[image];
    if (imageChange.kind !== "replace") continue;
    const path = PATHS[image](customerId);
    await uploadBrandingFile(path, imageChange.file);
    if (!saved[image]) added.push(path);
    paths[image] = path;
  }
  try {
    await saveBranding(customerId, {
      accent_colour: change.accent,
      logo_path: paths.logo,
      background_path: paths.background,
      background_dim: change.backgroundDim,
    });
  } catch (error) {
    await removeBrandingFiles(added).catch(() => undefined);
    throw error;
  }
}

/**
 * Resets a company to the Mini-ATS theme: every file in its branding folder first, also one a
 * failed save left behind, then the row. A failure before the row leaves the row with paths to
 * missing files, which the app shows as no image, and a new reset finishes.
 */
export async function resetTheme(customerId: string): Promise<void> {
  await removeBrandingFiles(await listBrandingFiles(customerId));
  await deleteBranding(customerId);
}
