import { z } from "zod";

export const LANGUAGES = ["sv", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Swedish is the default because the first customers are Swedish companies. */
export const DEFAULT_LANGUAGE: Language = "sv";
export const LANGUAGE_COOKIE = "lang";
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Locale passed to Intl for each language. */
export const LOCALES: Record<Language, string> = { sv: "sv-SE", en: "en-GB" };

const languageSchema = z.enum(LANGUAGES).catch(DEFAULT_LANGUAGE);

/** Any value from a cookie or the URL becomes a supported language. */
export function parseLanguage(value: unknown): Language {
  return languageSchema.parse(value);
}

/** Reads the language from a `Cookie` header or `document.cookie` string. */
export function languageFromCookies(cookies: string | null | undefined): Language {
  const match = (cookies ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
  return parseLanguage(match?.slice(LANGUAGE_COOKIE.length + 1));
}

export function languageCookie(language: Language): string {
  return `${LANGUAGE_COOKIE}=${language}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
