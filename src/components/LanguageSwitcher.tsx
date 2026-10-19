import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES, parseLanguage } from "@/lib/language";

/** Language choice inside the user menu. */
export function LanguageMenuItems() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {t("language.label")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={language}
        onValueChange={(value) => setLanguage(parseLanguage(value))}
      >
        {LANGUAGES.map((lang) => (
          <DropdownMenuRadioItem key={lang} value={lang} lang={lang}>
            {t(`language.${lang}`)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/** Language choice as two toggle buttons, for pages without the user menu. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <div role="group" aria-label={t("language.label")} className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <Button
          key={lang}
          type="button"
          variant={lang === language ? "secondary" : "ghost"}
          size="sm"
          lang={lang}
          aria-pressed={lang === language}
          onClick={() => setLanguage(lang)}
        >
          {t(`language.${lang}`)}
        </Button>
      ))}
    </div>
  );
}
