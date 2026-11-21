import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrandingInput } from "@/lib/api/customerBranding";
import { resetTheme, saveTheme, type ThemeChange } from "@/lib/branding";
import { MAX_BACKGROUND_SOURCE_BYTES, MAX_BRANDING_IMAGE_BYTES } from "@/lib/constants";
import { fittedSize } from "@/lib/prepare-background";
import { accentError, backgroundSourceError, brandingImageError } from "@/lib/validation";

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
  backgroundPath: (customerId: string) => `${customerId}/background`,
  uploadBrandingFile: (path: string) => step(`upload ${path}`),
  removeBrandingFiles: (paths: string[]) => step(`remove ${paths.join(",")}`),
  listBrandingFiles: () => step("list").then(() => steps.files),
}));
vi.mock("@/lib/api/customerBranding", () => ({
  saveBranding: (_customerId: string, input: BrandingInput) =>
    step(
      `save ${input.accent_colour} ${input.logo_path} ${input.background_path} ${input.background_dim}`,
    ),
  deleteBranding: () => step("delete row"),
}));

const C = "c1";
const file = new File(["png"], "logo.png", { type: "image/png" });

beforeEach(() => {
  steps.ran = [];
  steps.failAt = null;
  steps.files = [];
});

const NONE = { logo: null, background: null };
const keep = { kind: "keep" } as const;
const change = (overrides: Partial<ThemeChange>): ThemeChange => ({
  accent: null,
  logo: keep,
  background: keep,
  backgroundDim: "medium",
  ...overrides,
});

describe("saving the theme", () => {
  it("keeps the images and saves the accent and the dim level in one write", async () => {
    await saveTheme(
      C,
      { logo: "c1/logo", background: "c1/background" },
      change({ accent: "#1d4ed8", backgroundDim: "strong" }),
    );
    expect(steps.ran).toEqual(["save #1d4ed8 c1/logo c1/background strong"]);
  });

  it("uploads a new logo to the fixed path, then saves the row", async () => {
    await saveTheme(C, NONE, change({ logo: { kind: "replace", file } }));
    expect(steps.ran).toEqual(["upload c1/logo", "save null c1/logo null medium"]);
  });

  it("uploads both images before the row when both are new", async () => {
    await saveTheme(
      C,
      NONE,
      change({ logo: { kind: "replace", file }, background: { kind: "replace", file } }),
    );
    expect(steps.ran).toEqual([
      "upload c1/logo",
      "upload c1/background",
      "save null c1/logo c1/background medium",
    ]);
  });

  it("removes the images just added when the row cannot be saved", async () => {
    steps.failAt = "save null c1/logo c1/background medium";
    await expect(
      saveTheme(
        C,
        NONE,
        change({ logo: { kind: "replace", file }, background: { kind: "replace", file } }),
      ),
    ).rejects.toThrow();
    expect(steps.ran.at(-1)).toBe("remove c1/logo,c1/background");
  });

  it("keeps a replaced image when the row cannot be saved, since its path still names it", async () => {
    steps.failAt = "save null c1/logo c1/background medium";
    await expect(
      saveTheme(
        C,
        { logo: "c1/logo", background: null },
        change({ logo: { kind: "replace", file }, background: { kind: "replace", file } }),
      ),
    ).rejects.toThrow();
    expect(steps.ran.at(-1)).toBe("remove c1/background");
  });

  it("saves nothing when an upload fails", async () => {
    steps.failAt = "upload c1/background";
    await expect(
      saveTheme(C, NONE, change({ background: { kind: "replace", file } })),
    ).rejects.toThrow();
    expect(steps.ran).toEqual(["upload c1/background"]);
  });

  it("removes an image just added when a later upload fails", async () => {
    steps.failAt = "upload c1/background";
    await expect(
      saveTheme(
        C,
        NONE,
        change({ logo: { kind: "replace", file }, background: { kind: "replace", file } }),
      ),
    ).rejects.toThrow();
    expect(steps.ran).toEqual(["upload c1/logo", "upload c1/background", "remove c1/logo"]);
  });

  it("removes an image file first and the path after, so no file is left that nobody sees", async () => {
    await saveTheme(
      C,
      { logo: "c1/logo", background: "c1/background" },
      change({ accent: "#b91c1c", background: { kind: "remove" } }),
    );
    expect(steps.ran).toEqual(["remove c1/background", "save #b91c1c c1/logo null medium"]);
  });

  it("removes before it uploads, so a failed upload leaves no file without a path", async () => {
    await saveTheme(
      C,
      { logo: "c1/logo", background: null },
      change({ logo: { kind: "remove" }, background: { kind: "replace", file } }),
    );
    expect(steps.ran).toEqual([
      "remove c1/logo",
      "upload c1/background",
      "save null null c1/background medium",
    ]);
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

describe("a background image", () => {
  it("takes the logo's types up to the larger limit before it is made smaller", () => {
    expect(
      backgroundSourceError({ type: "image/jpeg", size: MAX_BACKGROUND_SOURCE_BYTES }),
    ).toBeNull();
    expect(
      backgroundSourceError({ type: "image/jpeg", size: MAX_BACKGROUND_SOURCE_BYTES + 1 }),
    ).toBe("background_source_too_large");
    expect(backgroundSourceError({ type: "image/svg+xml", size: 10 })).toBe("branding_image_type");
    expect(backgroundSourceError({ type: "image/png", size: 0 })).toBe("branding_image_empty");
  });

  it("is drawn at most the longest edge given, keeping its shape, and never larger", () => {
    expect(fittedSize(6000, 4000, 2560)).toEqual({ width: 2560, height: 1707 });
    expect(fittedSize(1000, 3000, 2560)).toEqual({ width: 853, height: 2560 });
    expect(fittedSize(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});
