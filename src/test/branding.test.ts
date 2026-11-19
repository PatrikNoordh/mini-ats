import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetTheme, saveTheme } from "@/lib/branding";
import { MAX_BRANDING_IMAGE_BYTES } from "@/lib/constants";
import { accentError, brandingImageError } from "@/lib/validation";

// The steps of a save and a reset, in order, with any one of them failing where told to.
const steps = vi.hoisted(() => ({
  ran: [] as string[],
  failAt: null as string | null,
  files: [] as string[],
}));

function step(name: string) {
  steps.ran.push(name);
  return name === steps.failAt ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
}

vi.mock("@/lib/api/brandingFiles", () => ({
  logoPath: (customerId: string) => `${customerId}/logo`,
  uploadBrandingFile: (path: string) => step(`upload ${path}`),
  removeBrandingFiles: (paths: string[]) => step(`remove ${paths.join(",")}`),
  listBrandingFiles: () => step("list").then(() => steps.files),
}));
vi.mock("@/lib/api/customerBranding", () => ({
  saveBranding: (
    _customerId: string,
    input: { accent_colour: string | null; logo_path: string | null },
  ) => step(`save ${input.accent_colour} ${input.logo_path}`),
  deleteBranding: () => step("delete row"),
}));

const C = "c1";
const file = new File(["png"], "logo.png", { type: "image/png" });

beforeEach(() => {
  steps.ran = [];
  steps.failAt = null;
  steps.files = [];
});

describe("saving the theme", () => {
  it("keeps the logo and saves the accent in one write", async () => {
    await saveTheme(C, "c1/logo", { accent: "#1d4ed8", logo: { kind: "keep" } });
    expect(steps.ran).toEqual(["save #1d4ed8 c1/logo"]);
  });

  it("uploads a new logo to the fixed path, then saves the row", async () => {
    await saveTheme(C, null, { accent: null, logo: { kind: "replace", file } });
    expect(steps.ran).toEqual(["upload c1/logo", "save null c1/logo"]);
  });

  it("removes a logo just uploaded when the row cannot be saved and there was none", async () => {
    steps.failAt = "save null c1/logo";
    await expect(
      saveTheme(C, null, { accent: null, logo: { kind: "replace", file } }),
    ).rejects.toThrow();
    expect(steps.ran).toEqual(["upload c1/logo", "save null c1/logo", "remove c1/logo"]);
  });

  it("keeps the file when the company had a logo, since its path still names it", async () => {
    steps.failAt = "save null c1/logo";
    await expect(
      saveTheme(C, "c1/logo", { accent: null, logo: { kind: "replace", file } }),
    ).rejects.toThrow();
    expect(steps.ran).toEqual(["upload c1/logo", "save null c1/logo"]);
  });

  it("saves nothing when the upload fails", async () => {
    steps.failAt = "upload c1/logo";
    await expect(
      saveTheme(C, null, { accent: null, logo: { kind: "replace", file } }),
    ).rejects.toThrow();
    expect(steps.ran).toEqual(["upload c1/logo"]);
  });

  it("removes the logo file first and the path after, so no file is left that nobody sees", async () => {
    await saveTheme(C, "c1/logo", { accent: "#b91c1c", logo: { kind: "remove" } });
    expect(steps.ran).toEqual(["remove c1/logo", "save #b91c1c null"]);
  });
});

describe("resetting the theme", () => {
  it("removes every file in the folder first, then the row", async () => {
    steps.files = ["c1/logo", "c1/background"];
    await resetTheme(C);
    expect(steps.ran).toEqual(["list", "remove c1/logo,c1/background", "delete row"]);
  });

  it("keeps the row when the files cannot be removed, so a new reset finishes", async () => {
    steps.files = ["c1/logo"];
    steps.failAt = "remove c1/logo";
    await expect(resetTheme(C)).rejects.toThrow();
    expect(steps.ran).toEqual(["list", "remove c1/logo"]);
  });
});

describe("the form's checks", () => {
  it("takes a readable colour code in either case, with spaces around it", () => {
    expect(accentError(" #1D4ED8 ")).toBeNull();
    expect(accentError("#1d4ed8")).toBeNull();
  });

  it("says which rule a colour code breaks", () => {
    expect(accentError("")).toBe("accent_format");
    expect(accentError("#1d4ed")).toBe("accent_format");
    expect(accentError("#777777")).toBe("accent_text_contrast");
    expect(accentError("#facc15")).toBe("accent_background_contrast");
  });

  it("takes a PNG, JPEG or WebP logo up to the limit, and nothing else", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(brandingImageError({ type, size: MAX_BRANDING_IMAGE_BYTES })).toBeNull();
    }
    expect(brandingImageError({ type: "image/svg+xml", size: 10 })).toBe("branding_image_type");
    expect(brandingImageError({ type: "image/gif", size: 10 })).toBe("branding_image_type");
    expect(brandingImageError({ type: "image/png", size: 0 })).toBe("branding_image_empty");
    expect(brandingImageError({ type: "image/png", size: MAX_BRANDING_IMAGE_BYTES + 1 })).toBe(
      "branding_image_too_large",
    );
  });
});
