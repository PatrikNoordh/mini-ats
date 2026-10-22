import { useTranslation } from "react-i18next";
import { LOCALES, parseLanguage, type Language } from "./language";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/** A date such as "2 okt. 2026" or "2 Oct 2026". */
export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], DATE_OPTIONS).format(new Date(iso));
}

export function formatNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language]).format(value);
}

/** Names joined the way the language does it: "Platschef och Snickare", "A, B and C". */
export function formatList(items: readonly string[], language: Language): string {
  return new Intl.ListFormat(LOCALES[language], { type: "conjunction" }).format(items);
}

/** Sorts user data (names, titles) the way the active language expects. */
export function compareText(a: string, b: string, language: Language): number {
  return a.localeCompare(b, LOCALES[language]);
}

/** The formatters bound to the active language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const language = parseLanguage(i18n.language);
  return {
    language,
    date: (iso: string) => formatDate(iso, language),
    number: (value: number) => formatNumber(value, language),
    list: (items: readonly string[]) => formatList(items, language),
    compare: (a: string, b: string) => compareText(a, b, language),
  };
}
