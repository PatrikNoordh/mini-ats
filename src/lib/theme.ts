// A customer's accent colour as theme tokens (ATS-53, docs/next-branding.md). The app shell sets
// them as inline variables on <html>, so dialogs and menus, which render outside the shell, get
// them too. A colour that is not readable is ignored, and the app keeps the Mini-ATS accent.
import {
  ACCENT_TEXT_DARKEN_STEP_PERCENT,
  ACCENT_TINT_PERCENT,
  DEFAULT_SURFACE_OPACITY,
  SURFACE_FLOOR_MARGIN,
  SURFACE_OPACITY_STEP,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
} from "@/lib/constants";
import {
  contrastRatio,
  hexToLinearRgb,
  isHexColour,
  linearRgbToHex,
  luminance,
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
  return accentProblem(accent) === null;
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

/**
 * The six accents the settings page offers first (ATS-54), each readable by isReadableAccent and
 * named by `appearance.presets.<name>` in the locale files. src/test/theme.test.ts checks both.
 */
export const PRESET_ACCENTS = [
  { name: "blue", accent: "#1d4ed8" },
  { name: "violet", accent: "#6d28d9" },
  { name: "green", accent: "#15803d" },
  { name: "red", accent: "#b91c1c" },
  { name: "orange", accent: "#c2410c" },
  { name: "slate", accent: "#334155" },
] as const;

/** Why an accent cannot be used, or null when it can: the form says which rule it breaks. */
export type AccentProblem = "accent_format" | "accent_text_contrast" | "accent_background_contrast";

/** The contrast an accent reaches: its text on it, and it against the page background. */
export function accentContrast(accent: string): { text: number; background: number } {
  return {
    text: textOnAccent(accent).contrast,
    background: contrastRatio(hexToLinearRgb(accent), colour("background")),
  };
}

/** The first rule the accent breaks, in the order the form explains them, or null. */
export function accentProblem(accent: string): AccentProblem | null {
  if (!isHexColour(accent)) return "accent_format";
  const { text, background } = accentContrast(accent);
  if (text < MIN_TEXT_CONTRAST) return "accent_text_contrast";
  if (background < MIN_UI_CONTRAST) return "accent_background_contrast";
  return null;
}

/**
 * The luminance of the text on a chip (ATS-66): the dark foreground. A chip draws all its text in
 * it, muted text and links included (`.chip-on-image` in src/styles.css), because a chip that had
 * to keep light grey text readable would have to be almost solid over any dark part of an image.
 */
function chipTextLuminance(): number {
  return luminance(colour("foreground"));
}

/** How solid a chip must be over one area of the image for the lightest text to stay readable. */
function opacityFor(area: LinearRgb, card: LinearRgb, needed: number): number {
  if (luminance(area) >= needed) return 0;
  let [low, high] = [0, 1];
  // The chip is the card colour over the area; more of it is lighter, so a halving search finds it.
  for (let i = 0; i < 20; i += 1) {
    const middle = (low + high) / 2;
    if (luminance(mix(card, area, middle)) >= needed) high = middle;
    else low = middle;
  }
  return high;
}

/**
 * The floor for the chips over a background image (ATS-66): the lowest opacity at which a chip,
 * the card colour over the image, keeps its text, the dark foreground, at
 * MIN_TEXT_CONTRAST over every sampled area. The areas are a shrunken copy of the image, so each
 * is already averaged like the chips' blur. Rounded up to SURFACE_OPACITY_STEP, with
 * SURFACE_FLOOR_MARGIN added, and never above 1. The page's scrim is left out: it only lightens.
 */
export function surfaceFloor(areas: LinearRgb[]): number {
  const card = colour("card");
  const needed = MIN_TEXT_CONTRAST * (chipTextLuminance() + 0.05) - 0.05;
  const raw = Math.max(0, ...areas.map((area) => opacityFor(area, card, needed)));
  const steps = Math.ceil((raw + SURFACE_FLOOR_MARGIN) / SURFACE_OPACITY_STEP);
  return Math.min(1, Number((steps * SURFACE_OPACITY_STEP).toFixed(2)));
}

/** What the chips' opacity depends on in a company's theme. */
export interface ChipTheme {
  background_path: string | null;
  background_floor: number | null;
  surface_opacity: number | null;
}

/**
 * How solid the chips over the background image are (ATS-66), from 0 to 1, or null when there is
 * no image and so no chips. A background uploaded before ATS-66 has no measured floor and keeps
 * fully solid chips. Otherwise the company's choice, or the default, but never below the floor.
 */
export function chipOpacity(theme: ChipTheme | null): number | null {
  if (!theme?.background_path) return null;
  if (theme.background_floor === null) return 1;
  return Math.min(
    1,
    Math.max(theme.surface_opacity ?? DEFAULT_SURFACE_OPACITY, theme.background_floor),
  );
}
