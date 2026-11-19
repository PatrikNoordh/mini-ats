import { deleteBranding, saveBranding } from "@/lib/api/customerBranding";
import {
  listBrandingFiles,
  logoPath,
  removeBrandingFiles,
  uploadBrandingFile,
} from "@/lib/api/brandingFiles";

/** What happens to the logo when the theme is saved. */
export type LogoChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "remove" };

export interface ThemeChange {
  accent: string | null;
  logo: LogoChange;
}

/**
 * Saves a company's theme (ATS-54). Storage and the database share no transaction, so the steps
 * run in the order that leaves the least behind, as for a CV (docs/data-safety.md § 4):
 * - A new logo is uploaded to the fixed path first, then the row is saved. If the row cannot be
 *   saved and the company had no logo, the file just uploaded is removed again. If it had one,
 *   the path still names the same file, now the new logo.
 * - A removed logo goes first and the row after, so a failure in between leaves a path to a
 *   missing file, which the sidebar shows as the Mini-ATS mark and a new save clears, never a
 *   file that nobody can see.
 */
export async function saveTheme(
  customerId: string,
  currentLogo: string | null,
  change: ThemeChange,
): Promise<void> {
  const { accent, logo } = change;
  if (logo.kind === "keep") {
    await saveBranding(customerId, { accent_colour: accent, logo_path: currentLogo });
    return;
  }
  if (logo.kind === "remove") {
    if (currentLogo) await removeBrandingFiles([currentLogo]);
    await saveBranding(customerId, { accent_colour: accent, logo_path: null });
    return;
  }
  const path = logoPath(customerId);
  await uploadBrandingFile(path, logo.file);
  try {
    await saveBranding(customerId, { accent_colour: accent, logo_path: path });
  } catch (error) {
    if (!currentLogo) await removeBrandingFiles([path]).catch(() => undefined);
    throw error;
  }
}

/**
 * Resets a company to the Mini-ATS theme: every file in its branding folder first, also one a
 * failed save left behind, then the row. A failure before the row leaves the row with paths to
 * missing files, which the app shows as the Mini-ATS mark, and a new reset finishes.
 */
export async function resetTheme(customerId: string): Promise<void> {
  await removeBrandingFiles(await listBrandingFiles(customerId));
  await deleteBranding(customerId);
}
