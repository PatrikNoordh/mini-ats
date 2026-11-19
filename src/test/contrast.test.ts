import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  hexToLinearRgb,
  isHexColour,
  linearRgbToHex,
  luminance,
  mix,
  oklchToLinearRgb,
} from "@/lib/contrast";

describe("hex colours", () => {
  it("takes #rrggbb in either case and nothing else", () => {
    expect(isHexColour("#0f766e")).toBe(true);
    expect(isHexColour("#0F766E")).toBe(true);
    for (const value of ["0f766e", "#fff", "#0f766e00", "red", "#gggggg", ""]) {
      expect(isHexColour(value)).toBe(false);
    }
  });

  it("refuses to convert anything but #rrggbb", () => {
    expect(() => hexToLinearRgb("#fff")).toThrow();
  });

  it("decodes the sRGB channels to linear light", () => {
    expect(hexToLinearRgb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToLinearRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    // 0x80 = 128: (128 / 255 + 0.055) / 1.055, to the power 2.4.
    expect(hexToLinearRgb("#808080").r).toBeCloseTo(0.21586, 5);
  });
});

describe("OKLCH colours", () => {
  it("turns white and black into the ends of the scale", () => {
    expect(luminance(oklchToLinearRgb({ l: 1, c: 0, h: 0 }))).toBeCloseTo(1, 4);
    expect(luminance(oklchToLinearRgb({ l: 0, c: 0, h: 0 }))).toBeCloseTo(0, 4);
  });

  it("matches the same colour given as hex", () => {
    // #0f766e is oklch(0.5106 0.0861 186.39).
    const fromOklch = oklchToLinearRgb({ l: 0.5106, c: 0.0861, h: 186.39 });
    const fromHex = hexToLinearRgb("#0f766e");
    expect(fromOklch.r).toBeCloseTo(fromHex.r, 2);
    expect(fromOklch.g).toBeCloseTo(fromHex.g, 2);
    expect(fromOklch.b).toBeCloseTo(fromHex.b, 2);
  });

  it("clamps a colour outside the sRGB gamut", () => {
    const { r, g, b } = oklchToLinearRgb({ l: 0.7, c: 0.4, h: 145 });
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe("contrast", () => {
  it("is 21 between black and white and 1 between a colour and itself", () => {
    const white = hexToLinearRgb("#ffffff");
    const black = hexToLinearRgb("#000000");
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it("matches the WCAG examples around the 4.5 limit", () => {
    const white = hexToLinearRgb("#ffffff");
    expect(contrastRatio(hexToLinearRgb("#767676"), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToLinearRgb("#777777"), white)).toBeLessThan(4.5);
  });
});

describe("mixing and writing colours", () => {
  it("writes a colour back as the same lower-case #rrggbb", () => {
    for (const hex of ["#0f766e", "#ffffff", "#000000", "#808080", "#1d4ed8"]) {
      expect(linearRgbToHex(hexToLinearRgb(hex))).toBe(hex);
    }
    expect(linearRgbToHex(hexToLinearRgb("#0F766E"))).toBe("#0f766e");
  });

  it("mixes in gamma-encoded sRGB, so a fifth of black on white is #cccccc", () => {
    // 0.8 × 255 = 204 = 0xcc. A mix in linear light would give a much lighter #e7e7e7.
    const fifth = mix(hexToLinearRgb("#000000"), hexToLinearRgb("#ffffff"), 0.2);
    expect(linearRgbToHex(fifth)).toBe("#cccccc");
  });

  it("gives the first colour at share 1 and the second at share 0", () => {
    const red = hexToLinearRgb("#b91c1c");
    const white = hexToLinearRgb("#ffffff");
    expect(linearRgbToHex(mix(red, white, 1))).toBe("#b91c1c");
    expect(linearRgbToHex(mix(red, white, 0))).toBe("#ffffff");
  });
});
