/// <reference types="node" />
// The demo seed's made-up brand (ATS-55): a colour, a logo and a background image, all drawn here
// when the seed runs, so no image file, and never a real company's, is in the repo.
import { png, type Rgb } from "./png.ts";

/** A demo customer's theme, as the settings page would save it. */
export interface DemoBrand {
  accent: string;
  logo: Buffer;
  background: Buffer;
  dim: "light" | "medium" | "strong";
}

/** The made-up brand's colours: a violet, its light tint and a near-white. */
const VIOLET: Rgb = [109, 40, 217];
const LIGHT: Rgb = [237, 233, 254];
const PALE: Rgb = [250, 249, 255];

const LOGO_PX = 96;
const BACKGROUND_WIDTH = 1200;
const BACKGROUND_HEIGHT = 800;
/** Every how many pixels the background's diagonal stripes repeat, and how wide each is. */
const STRIPE_PERIOD = 48;
const STRIPE_WIDTH = 6;

const mixRgb = (a: Rgb, b: Rgb, share: number): Rgb => [
  Math.round(a[0] * share + b[0] * (1 - share)),
  Math.round(a[1] * share + b[1] * (1 - share)),
  Math.round(a[2] * share + b[2] * (1 - share)),
];

/** A violet square with a white ring: a plain mark that is clearly not a real company's. */
function logo(): Buffer {
  const centre = LOGO_PX / 2;
  return png(LOGO_PX, LOGO_PX, (x, y) => {
    const distance = Math.hypot(x - centre, y - centre);
    const ring = distance > LOGO_PX * 0.22 && distance < LOGO_PX * 0.34;
    return ring ? PALE : VIOLET;
  });
}

/** A soft diagonal gradient from near-white to the light tint, with faint stripes over it. */
function background(): Buffer {
  return png(BACKGROUND_WIDTH, BACKGROUND_HEIGHT, (x, y) => {
    const along = (x + y) / (BACKGROUND_WIDTH + BACKGROUND_HEIGHT);
    const base = mixRgb(LIGHT, PALE, along);
    const stripe = (x + y) % STRIPE_PERIOD < STRIPE_WIDTH;
    return stripe ? mixRgb(VIOLET, base, 0.25) : base;
  });
}

/** The brand Studio Exempel gets in the demo. */
export function demoBrand(): DemoBrand {
  return { accent: "#6d28d9", logo: logo(), background: background(), dim: "medium" };
}
