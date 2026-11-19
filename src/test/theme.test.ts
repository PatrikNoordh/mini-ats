import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { contrastRatio, hexToLinearRgb, isHexColour, oklchToLinearRgb } from "@/lib/contrast";
import {
  accentAsText,
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
