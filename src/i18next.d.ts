import "i18next";
import type sv from "@/locales/sv.json";

// Types every t() key against the Swedish source file, so a missing or
// misspelled key fails `npx tsc --noEmit`.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof sv };
  }
}
