// WCAG 2 contrast between two colours, for a customer's accent colour (ATS-53). The theme's own
// colours are OKLCH and an accent is #rrggbb, so both are turned into linear sRGB first.

/** A colour as linear-light sRGB channels, each from 0 to 1. */
export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** A colour in OKLCH, as the theme tokens in src/styles.css are written. Hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Whether the text is a #rrggbb colour, the format customer_branding.accent_colour allows. */
export function isHexColour(value: string): boolean {
  return HEX_COLOUR.test(value);
}

/** One gamma-encoded sRGB channel (0–1) as linear light, by the sRGB transfer function. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** A #rrggbb colour as linear sRGB. Throws on anything else. */
export function hexToLinearRgb(hex: string): LinearRgb {
  const match = HEX_COLOUR.exec(hex);
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const [r, g, b] = match.slice(1).map((pair) => toLinear(parseInt(pair, 16) / 255));
  return { r: r!, g: g!, b: b! };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** An OKLCH colour as linear sRGB, by Björn Ottosson's OKLab matrices, clamped to the gamut. */
export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  return {
    r: clamp(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    g: clamp(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    b: clamp(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  };
}

/** WCAG relative luminance, from 0 (black) to 1 (white). */
export function luminance({ r, g, b }: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1 to 21, the same either way round. */
export function contrastRatio(one: LinearRgb, other: LinearRgb): number {
  const [light, dark] = [luminance(one), luminance(other)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** One linear-light channel (0–1) as a gamma-encoded sRGB channel, the inverse of toLinear. */
function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** A linear sRGB colour as #rrggbb, in lower case like customer_branding.accent_colour. */
export function linearRgbToHex({ r, g, b }: LinearRgb): string {
  const pair = (channel: number) =>
    Math.round(fromLinear(clamp(channel)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/**
 * Two colours mixed in gamma-encoded sRGB, the way a translucent colour over a surface looks:
 * `share` is how much of the first, from 0 to 1.
 */
export function mix(first: LinearRgb, second: LinearRgb, share: number): LinearRgb {
  const channel = (one: number, other: number) =>
    toLinear(fromLinear(one) * share + fromLinear(other) * (1 - share));
  return {
    r: channel(first.r, second.r),
    g: channel(first.g, second.g),
    b: channel(first.b, second.b),
  };
}

/** An 8-bit sRGB pixel, as a canvas gives it, as linear sRGB. */
export function rgb8ToLinear(r: number, g: number, b: number): LinearRgb {
  return { r: toLinear(r / 255), g: toLinear(g / 255), b: toLinear(b / 255) };
}
