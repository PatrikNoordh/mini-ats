import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  hexToLinearRgb,
  isHexColour,
  luminance,
  mix,
  oklchToLinearRgb,
} from "@/lib/contrast";
import {
  DEFAULT_SURFACE_OPACITY,
  SURFACE_FLOOR_MARGIN,
  SURFACE_OPACITY_STEP,
} from "@/lib/constants";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import {
  accentAsText,
  accentProblem,
  chipOpacity,
  PRESET_ACCENTS,
  surfaceFloor,
  type ChipTheme,
  isReadableAccent,
  textOnAccent,
  THEME_COLOURS,
  THEMED_TOKENS,
  themeTokens,
  type ThemedToken,
} from "@/lib/theme";

const styles = readFileSync("src/styles.css", "utf8");
const WHITE = hexToLinearRgb("#ffffff");
const BACKGROUND = oklchToLinearRgb(THEME_COLOURS.background);
const FOREGROUND = oklchToLinearRgb(THEME_COLOURS.foreground);

/** The declarations of one CSS block, by its selector, as token → value. */
function block(selector: string): Map<string, string> {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in src/styles.css`);
  const body = styles.slice(start, styles.indexOf("}", start));
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, token, value]) => [token!, value!]),
  );
}

/** The text on the sidebar's tint, which a theme leaves at its value on :root. */
const SIDEBAR_FOREGROUND = (() => {
  const value = block(":root").get("--sidebar-foreground") ?? "";
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`--sidebar-foreground is not an oklch colour: ${value}`);
  return oklchToLinearRgb({ l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) });
})();

describe("the theme colours the check measures against", () => {
  it("are the tokens on :root in src/styles.css", () => {
    const root = block(":root");
    for (const [name, { l, c, h }] of Object.entries(THEME_COLOURS)) {
      expect(root.get(`--${name}`)).toBe(`oklch(${l} ${c} ${h})`);
    }
  });
});

describe("the themed tokens", () => {
  it("are each put back by .theme-mini-ats, and nothing else is", () => {
    expect([...block(".theme-mini-ats").keys()].sort()).toEqual([...THEMED_TOKENS].sort());
  });

  it("have the same Mini-ATS value on :root as in .theme-mini-ats", () => {
    const root = block(":root");
    for (const [token, value] of block(".theme-mini-ats")) expect(root.get(token)).toBe(value);
  });
});

describe("the text on the accent", () => {
  it("is the light text on a dark accent", () => {
    expect(textOnAccent("#1d4ed8").token).toBe("var(--mini-ats-primary-foreground)");
    expect(textOnAccent("#000000").token).toBe("var(--mini-ats-primary-foreground)");
  });

  it("is the dark foreground on a light accent", () => {
    expect(textOnAccent("#facc15").token).toBe("var(--foreground)");
    expect(textOnAccent("#ffffff").token).toBe("var(--foreground)");
  });

  it("is whichever of the two has the higher contrast", () => {
    const { contrast } = textOnAccent("#1d4ed8");
    expect(contrast).toBeGreaterThan(6);
    expect(contrast).toBeLessThan(7);
  });
});

describe("a readable accent", () => {
  it("passes when its text reaches 4.5:1 and it reaches 3:1 on the background", () => {
    for (const accent of ["#1d4ed8", "#0f766e", "#b91c1c", "#7c3aed"]) {
      expect(isReadableAccent(accent)).toBe(true);
    }
  });

  it("fails when no text colour reaches 4.5:1 on it", () => {
    // White text reaches 4.35:1 on mid grey, and the dark foreground less.
    expect(isReadableAccent("#777777")).toBe(false);
  });

  it("fails when it does not stand out from the background", () => {
    // Dark text is readable on these, but a button would hardly show on the page.
    for (const accent of ["#facc15", "#f59e0b", "#ffffff"]) {
      expect(isReadableAccent(accent)).toBe(false);
    }
  });

  it("fails for anything that is not #rrggbb", () => {
    for (const accent of ["", "red", "#fff", "1d4ed8"])
      expect(isReadableAccent(accent)).toBe(false);
  });
});

describe("the theme's tokens", () => {
  it("are none for no accent and for one that is not readable", () => {
    expect(themeTokens(null)).toBeNull();
    expect(themeTokens("#facc15")).toBeNull();
    expect(themeTokens("not a colour")).toBeNull();
  });

  it("set every themed token for a readable accent", () => {
    const tokens = themeTokens("#1d4ed8");
    expect(Object.keys(tokens ?? {}).sort()).toEqual([...THEMED_TOKENS].sort());
    expect(tokens).toMatchObject({
      "--primary": "#1d4ed8",
      "--ring": "#1d4ed8",
      "--sidebar-primary": "#1d4ed8",
      "--sidebar-ring": "#1d4ed8",
      "--primary-foreground": "var(--mini-ats-primary-foreground)",
      "--sidebar-primary-foreground": "var(--mini-ats-primary-foreground)",
      "--accent-foreground": "var(--foreground)",
      "--sidebar-accent-foreground": "var(--sidebar-foreground)",
    });
    for (const token of ["--primary-text", "--accent", "--sidebar-accent"] as const) {
      expect(isHexColour(tokens?.[token] ?? "")).toBe(true);
    }
  });

  it("tint the hover and active backgrounds lightly with the accent", () => {
    const tokens = themeTokens("#1d4ed8");
    const tintOnWhite = contrastRatio(hexToLinearRgb(tokens?.["--accent"] ?? ""), WHITE);
    expect(tintOnWhite).toBeGreaterThan(1);
    expect(tintOnWhite).toBeLessThan(1.5);
  });

  it("keep a dark accent as the text colour, and darken a light one until it is readable", () => {
    expect(themeTokens("#1d4ed8")?.["--primary-text"]).toBe("#1d4ed8");
    // Red 500 takes dark text and stands out on the page, but is too light to be text itself.
    const light = "#ef4444";
    expect(contrastRatio(hexToLinearRgb(light), WHITE)).toBeLessThan(4.5);
    const text = themeTokens(light)?.["--primary-text"] ?? "";
    expect(text).not.toBe(light);
    expect(contrastRatio(hexToLinearRgb(text), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("keep every text readable, for every readable accent", () => {
    // Every colour with 16 levels a channel: 4,096 accents, of which about a third are readable.
    const levels = Array.from({ length: 16 }, (_, i) => (i * 17).toString(16).padStart(2, "0"));
    let readable = 0;
    for (const r of levels) {
      for (const g of levels) {
        for (const b of levels) {
          const accent = `#${r}${g}${b}`;
          const tokens = themeTokens(accent);
          if (!tokens) continue;
          readable += 1;
          const rgb = (token: ThemedToken) => hexToLinearRgb(tokens[token]);
          const surfaces = [BACKGROUND, WHITE, rgb("--accent"), rgb("--sidebar-accent")];
          for (const surface of surfaces) {
            expect(contrastRatio(rgb("--primary-text"), surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(FOREGROUND, surface)).toBeGreaterThanOrEqual(4.5);
          }
          expect(contrastRatio(SIDEBAR_FOREGROUND, rgb("--sidebar-accent"))).toBeGreaterThanOrEqual(
            4.5,
          );
          expect(textOnAccent(accent).contrast).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(hexToLinearRgb(accent), BACKGROUND)).toBeGreaterThanOrEqual(3);
        }
      }
    }
    expect(readable).toBeGreaterThan(1000);
  });
});

describe("the accent as text", () => {
  it("is the accent itself when it is readable on every surface", () => {
    const accent = hexToLinearRgb("#1d4ed8");
    expect(accentAsText(accent, [WHITE])).toEqual(accent);
  });

  it("is the dark foreground at worst", () => {
    const text = accentAsText(hexToLinearRgb("#ffffff"), [WHITE]);
    expect(contrastRatio(text, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the preset accents", () => {
  it("are all readable, all different, and each has a name in both languages", () => {
    const accents = PRESET_ACCENTS.map((preset) => preset.accent);
    expect(new Set(accents).size).toBe(accents.length);
    for (const { name, accent } of PRESET_ACCENTS) {
      expect(accentProblem(accent)).toBeNull();
      expect(accent).toBe(accent.toLowerCase());
      expect(sv.appearance.presets[name]).toBeTruthy();
      expect(en.appearance.presets[name]).toBeTruthy();
    }
  });
});

describe("why an accent cannot be used", () => {
  it("is the format first, then the text on it, then the background", () => {
    expect(accentProblem("blue")).toBe("accent_format");
    expect(accentProblem("#777777")).toBe("accent_text_contrast");
    expect(accentProblem("#facc15")).toBe("accent_background_contrast");
    expect(accentProblem("#1d4ed8")).toBeNull();
  });

  it("has a message in both languages for every reason", () => {
    for (const problem of [
      "accent_format",
      "accent_text_contrast",
      "accent_background_contrast",
    ] as const) {
      expect(sv.validation[problem]).toBeTruthy();
      expect(en.validation[problem]).toBeTruthy();
    }
  });
});

describe("the chips' floor over a background image", () => {
  const solid = (hex: string, count = 4) =>
    Array.from({ length: count }, () => hexToLinearRgb(hex));

  it("leaves room over all black, and is close to clear over all white", () => {
    // Dark text needs far less of the card than light grey text did (ATS-66).
    expect(surfaceFloor(solid("#000000"))).toBeGreaterThan(0.4);
    expect(surfaceFloor(solid("#000000"))).toBeLessThan(0.7);
    expect(surfaceFloor(solid("#ffffff"))).toBe(SURFACE_FLOOR_MARGIN);
  });

  it("is set by the darkest area, however small", () => {
    const mostlyWhite = [...solid("#ffffff", 99), hexToLinearRgb("#000000")];
    expect(surfaceFloor(mostlyWhite)).toBe(surfaceFloor(solid("#000000")));
  });

  it("rises as the image darkens, and never leaves 0 to 1", () => {
    const floors = ["#ffffff", "#bbbbbb", "#777777", "#333333", "#000000"].map((hex) =>
      surfaceFloor(solid(hex)),
    );
    expect([...floors].sort((a, b) => a - b)).toEqual(floors);
    for (const floor of floors) {
      expect(floor).toBeGreaterThanOrEqual(0);
      expect(floor).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the chips' text, the dark foreground, readable on a chip at the floor", () => {
    const card = oklchToLinearRgb(THEME_COLOURS.card);
    const texts = [oklchToLinearRgb(THEME_COLOURS.foreground)];
    for (const hex of ["#000000", "#1e3a8a", "#7f1d1d", "#555555", "#14532d", "#bbbbbb"]) {
      const area = hexToLinearRgb(hex);
      // Without the margin, unless the floor is capped at fully solid.
      const floor = surfaceFloor([area]);
      const at = floor === 1 ? 1 : floor - SURFACE_FLOOR_MARGIN;
      const chip = mix(card, area, at);
      for (const text of texts)
        expect(contrastRatio(text, chip)).toBeGreaterThanOrEqual(4.5 - 1e-6);
    }
  });

  it("is a step of the column's precision", () => {
    const floor = surfaceFloor(solid("#5a6b7c"));
    expect(Number((floor / SURFACE_OPACITY_STEP).toFixed(6)) % 1).toBe(0);
  });
});

describe("how solid the chips are", () => {
  const theme = (overrides: Partial<ChipTheme>): ChipTheme => ({
    background_path: "c1/background",
    background_floor: 0.4,
    surface_opacity: null,
    ...overrides,
  });

  it("is nothing without a background image", () => {
    expect(chipOpacity(null)).toBeNull();
    expect(chipOpacity(theme({ background_path: null }))).toBeNull();
  });

  it("is fully solid for a background from before ATS-66, which has no floor", () => {
    expect(chipOpacity(theme({ background_floor: null, surface_opacity: 0.2 }))).toBe(1);
  });

  it("is the company's choice, or the default, and never below the floor", () => {
    expect(chipOpacity(theme({ surface_opacity: 0.6 }))).toBe(0.6);
    expect(chipOpacity(theme({}))).toBe(DEFAULT_SURFACE_OPACITY);
    expect(chipOpacity(theme({ surface_opacity: 0.1 }))).toBe(0.4);
    expect(chipOpacity(theme({ background_floor: 0.95 }))).toBe(0.95);
  });
});
