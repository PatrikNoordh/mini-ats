import { describe, expect, it } from "vitest";

import { AppError, ERROR_CODES, errorCode } from "@/lib/errors";
import { compareText, formatDate, formatNumber } from "@/lib/format";
import { getI18n, getT } from "@/lib/i18n";
import { languageCookie, languageFromCookies, parseLanguage } from "@/lib/language";

describe("language", () => {
  it("accepts supported languages and falls back to Swedish", () => {
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("sv")).toBe("sv");
    expect(parseLanguage("de")).toBe("sv");
    expect(parseLanguage(undefined)).toBe("sv");
  });

  it("reads the lang cookie among other cookies", () => {
    expect(languageFromCookies("theme=dark; lang=en; x=1")).toBe("en");
    expect(languageFromCookies("lang=en")).toBe("en");
    expect(languageFromCookies("xlang=en")).toBe("sv");
    expect(languageFromCookies("")).toBe("sv");
    expect(languageFromCookies(null)).toBe("sv");
  });

  it("writes a cookie the reader understands", () => {
    const cookie = languageCookie("en");
    expect(cookie).toMatch(/^lang=en; path=\/; max-age=\d+; samesite=lax$/);
    expect(languageFromCookies(cookie.split(";")[0])).toBe("en");
  });
});

describe("translations", () => {
  it("keeps one instance per language", () => {
    expect(getI18n("sv")).toBe(getI18n("sv"));
    expect(getI18n("sv")).not.toBe(getI18n("en"));
    expect(getI18n("en").language).toBe("en");
  });

  it("translates in the requested language", () => {
    expect(getT("sv")("stages.hired")).toBe("Anställd");
    expect(getT("en")("stages.hired")).toBe("Hired");
  });

  it("uses plurals for counts", () => {
    expect(getT("en")("pipeline.cardCount", { count: 1 })).toBe("1 card");
    expect(getT("en")("pipeline.cardCount", { count: 3 })).toBe("3 cards");
    expect(getT("sv")("gate.openJobs", { count: 1 })).toBe("1 öppet jobb");
    expect(getT("sv")("gate.openJobs", { count: 2 })).toBe("2 öppna jobb");
  });
});

describe("Intl formatting", () => {
  const iso = "2026-10-02T12:00:00.000Z";

  it("formats dates for the language", () => {
    expect(formatDate(iso, "sv")).toBe("2 okt. 2026");
    expect(formatDate(iso, "en")).toBe("2 Oct 2026");
  });

  it("formats numbers for the language", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "sv").replace(/\s/g, " ")).toBe("1 234,5");
  });

  it("sorts å, ä and ö after z in Swedish", () => {
    const names = ["Örjan", "Zoe", "Åsa", "Anna"];
    expect([...names].sort((a, b) => compareText(a, b, "sv"))).toEqual([
      "Anna",
      "Zoe",
      "Åsa",
      "Örjan",
    ]);
  });
});

describe("error codes", () => {
  it("returns the code of an AppError", () => {
    expect(errorCode(new AppError("email_exists"))).toBe("email_exists");
  });

  it("returns unknown for any other error", () => {
    expect(errorCode(new Error("network down"))).toBe("unknown");
    expect(errorCode("boom")).toBe("unknown");
  });

  it("has a translation for every code in both languages", () => {
    for (const code of [...ERROR_CODES, "unknown"] as const) {
      expect(getT("sv")(`errors.${code}`)).not.toBe(`errors.${code}`);
      expect(getT("en")(`errors.${code}`)).not.toBe(`errors.${code}`);
    }
  });
});

describe("numbers inside translations", () => {
  it("formats counts with the shared Intl helper", () => {
    expect(getT("en")("pipeline.cardCount", { count: 1200 })).toBe("1,200 cards");
    expect(getT("sv")("pipeline.cardCount", { count: 1200 }).replace(/\s/g, " ")).toBe(
      "1 200 kort",
    );
  });
});
