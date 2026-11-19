// A customer's accent colour as theme tokens (ATS-53, docs/next-branding.md). The app shell sets
// them as inline variables on <html>, so dialogs and menus, which render outside the shell, get
// them too. A colour that is not readable is ignored, and the app keeps the Mini-ATS accent.
import {
  ACCENT_TEXT_DARKEN_STEP_PERCENT,
  ACCENT_TINT_PERCENT,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
} from "@/lib/constants";
import {
  contrastRatio,
  hexToLinearRgb,
  isHexColour,
  linearRgbToHex,
  mix,
  oklchToLinearRgb,
  type LinearRgb,
  type Oklch,
} from "@/lib/contrast";

/**
 * The theme colours the checks measure against, the same as the tokens of the same name on :root
 * in src/styles.css. src/test/theme.test.ts reads the file, so the two cannot drift.
 */
export const THEME_COLOURS = {
  background: { l: 0.975, c: 0.003, h: 220 },
  foreground: { l: 0.22, c: 0.015, h: 230 },
  card: { l: 1, c: 0, h: 0 },
  sidebar: { l: 1, c: 0, h: 0 },
  "mini-ats-primary-foreground": { l: 0.99, c: 0, h: 0 },
} as const satisfies Record<string, Oklch>;

/** Every token a customer's theme sets. `.theme-mini-ats` in src/styles.css puts each back. */
export const THEMED_TOKENS = [
  "--primary",
  "--primary-foreground",
  "--primary-text",
  "--ring",
  "--accent",
  "--accent-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
] as const;

export type ThemedToken = (typeof THEMED_TOKENS)[number];

const colour = (name: keyof typeof THEME_COLOURS) => oklchToLinearRgb(THEME_COLOURS[name]);

/** The two text colours that can sit on the accent, as tokens and as colours to measure. */
const TEXT_ON_ACCENT = [
  { token: "var(--mini-ats-primary-foreground)", colour: colour("mini-ats-primary-foreground") },
  { token: "var(--foreground)", colour: colour("foreground") },
] as const;

/**
 * The text colour on the accent: the Mini-ATS light text or the dark foreground, whichever has the
 * higher WCAG contrast with it, and that contrast.
 */
export function textOnAccent(accent: string): { token: string; contrast: number } {
  const rgb = hexToLinearRgb(accent);
  const [best] = TEXT_ON_ACCENT.map(({ token, colour: text }) => ({
    token,
    contrast: contrastRatio(rgb, text),
  })).sort((one, other) => other.contrast - one.contrast);
  return best!;
}

/**
 * Whether an accent colour keeps the app readable: its text reaches MIN_TEXT_CONTRAST on it, and
 * it reaches MIN_UI_CONTRAST against the background, so a button still stands out. Where the
 * accent is text itself, accentAsText darkens it as far as it needs.
 */
export function isReadableAccent(accent: string): boolean {
  if (!isHexColour(accent)) return false;
  const againstBackground = contrastRatio(hexToLinearRgb(accent), colour("background"));
  return textOnAccent(accent).contrast >= MIN_TEXT_CONTRAST && againstBackground >= MIN_UI_CONTRAST;
}

/** A colour as the #rrggbb it is set as, so a check measures exactly what the page shows. */
const asSet = (rgb: LinearRgb) => hexToLinearRgb(linearRgbToHex(rgb));

/** A light tint of the accent on a surface, for hover and active backgrounds. */
function tint(accent: LinearRgb, surface: LinearRgb): LinearRgb {
  return asSet(mix(accent, surface, ACCENT_TINT_PERCENT / 100));
}

/**
 * The accent as text, for links and the active sidebar item: the accent itself when it reaches
 * MIN_TEXT_CONTRAST on every surface given, otherwise the first step toward the dark foreground
 * that does. The foreground itself always does, so there is always an answer.
 */
export function accentAsText(accent: LinearRgb, surfaces: LinearRgb[]): LinearRgb {
  const foreground = colour("foreground");
  for (let percent = 0; percent < 100; percent += ACCENT_TEXT_DARKEN_STEP_PERCENT) {
    const text = asSet(mix(foreground, accent, percent / 100));
    if (surfaces.every((surface) => contrastRatio(text, surface) >= MIN_TEXT_CONTRAST)) return text;
  }
  return foreground;
}

/**
 * The token values for a customer's accent colour, or null for the Mini-ATS theme: no colour, or
 * one that is not readable. Text on the tints is the dark foreground, which stays readable on any
 * light tint, and the accent as text is readable on the background, the cards and the tints.
 */
export function themeTokens(accent: string | null): Record<ThemedToken, string> | null {
  if (!accent || !isReadableAccent(accent)) return null;
  const rgb = hexToLinearRgb(accent);
  const cardTint = tint(rgb, colour("card"));
  const sidebarTint = tint(rgb, colour("sidebar"));
  const text = accentAsText(rgb, [
    colour("background"),
    colour("card"),
    colour("sidebar"),
    cardTint,
    sidebarTint,
  ]);
  const onAccent = textOnAccent(accent).token;
  return {
    "--primary": accent,
    "--primary-foreground": onAccent,
    "--primary-text": linearRgbToHex(text),
    "--ring": accent,
    "--accent": linearRgbToHex(cardTint),
    "--accent-foreground": "var(--foreground)",
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": onAccent,
    "--sidebar-ring": accent,
    "--sidebar-accent": linearRgbToHex(sidebarTint),
    "--sidebar-accent-foreground": "var(--sidebar-foreground)",
  };
}
