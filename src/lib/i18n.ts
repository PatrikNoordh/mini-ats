import { createInstance, type i18n, type TFunction } from "i18next";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import { MAX_CV_BYTES } from "./constants";
import { formatNumber } from "./format";
import { DEFAULT_LANGUAGE, LANGUAGES, parseLanguage, type Language } from "./language";

// en must have every key that sv has. src/test/locales.test.ts also checks the reverse.
const english: typeof sv = en;

export const resources = {
  sv: { translation: sv },
  en: { translation: english },
} as const;

const BYTES_PER_MEGABYTE = 1024 * 1024;

function createI18n(language: Language): i18n {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES,
    resources,
    initAsync: false,
    interpolation: {
      escapeValue: false, // React already escapes output
      // Limits named in texts that are shown without variables, such as error codes in a toast.
      defaultVariables: { maxCvMegabytes: MAX_CV_BYTES / BYTES_PER_MEGABYTE },
    },
    returnEmptyString: false,
  });
  // `{{count, number}}` in the locale files goes through the same Intl helper as the rest of the app.
  instance.services.formatter?.add("number", (value, lng) =>
    formatNumber(Number(value), parseLanguage(lng)),
  );
  return instance;
}

// One instance per language, so concurrent server renders never share a mutable language.
const instances = new Map<Language, i18n>();

export function getI18n(language: Language): i18n {
  let instance = instances.get(language);
  if (!instance) {
    instance = createI18n(language);
    instances.set(language, instance);
  }
  return instance;
}

export function getT(language: Language): TFunction {
  return getI18n(language).t;
}

type PageKey = keyof typeof sv.meta;

/** Title and description tags for a page, in the given language. */
export function pageHead(language: Language, page: PageKey) {
  const t = getT(language);
  const title = t(`meta.${page}.title`);
  const description = t(`meta.${page}.description`);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  };
}
