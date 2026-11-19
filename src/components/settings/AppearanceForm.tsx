import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccentPicker, type AccentChoice } from "@/components/settings/AccentPicker";
import { LogoField } from "@/components/settings/LogoField";
import { ThemePreview } from "@/components/settings/ThemePreview";
import { useBrandingUrl, useResetTheme, useSaveTheme } from "@/hooks/useBranding";
import { useErrorToast } from "@/hooks/useErrorToast";
import type { LogoChange } from "@/lib/branding";
import { PRESET_ACCENTS } from "@/lib/theme";
import { accentError, brandingImageError, type ValidationKey } from "@/lib/validation";
import type { CustomerBranding } from "@/types";

/** The choice that shows a saved accent: none, one of the presets, or the customer's own. */
function choiceFor(accent: string | null): AccentChoice {
  if (!accent) return { kind: "default" };
  return PRESET_ACCENTS.some((preset) => preset.accent === accent)
    ? { kind: "preset", accent }
    : { kind: "custom" };
}

/** A link to a file chosen in the browser, for the preview, released when it is no longer shown. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

/**
 * The appearance settings (ATS-54): the colour, the logo and a preview of both before saving.
 * Saving and resetting are one click each. The form starts from the saved theme, and the page
 * mounts it again when the saved theme changes.
 */
export function AppearanceForm({
  customerId,
  companyName,
  branding,
}: {
  customerId: string;
  companyName: string;
  branding: CustomerBranding | null;
}) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const saved = branding?.accent_colour ?? null;
  const savedLogo = branding?.logo_path ?? null;
  const [choice, setChoice] = useState<AccentChoice>(() => choiceFor(saved));
  const [customCode, setCustomCode] = useState(() =>
    choiceFor(saved).kind === "custom" ? (saved ?? "") : "",
  );
  const [logo, setLogo] = useState<LogoChange>({ kind: "keep" });
  const [logoError, setLogoError] = useState<ValidationKey | null>(null);
  const save = useSaveTheme(customerId);
  const reset = useResetTheme(customerId);
  const savedLogoUrl = useBrandingUrl(customerId, savedLogo);
  const chosenLogoUrl = useObjectUrl(logo.kind === "replace" ? logo.file : null);

  const accent =
    choice.kind === "default"
      ? null
      : choice.kind === "preset"
        ? choice.accent
        : customCode.trim().toLowerCase();
  const accentProblem = choice.kind === "custom" ? accentError(customCode) : null;
  const changed = accent !== saved || logo.kind !== "keep";
  const busy = save.isPending || reset.isPending;

  const previewLogoUrl =
    logo.kind === "replace"
      ? chosenLogoUrl
      : logo.kind === "remove"
        ? null
        : (savedLogoUrl.data ?? null);
  const previewLogo = previewLogoUrl ? { src: previewLogoUrl, alt: companyName } : null;

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const problem = brandingImageError(file);
    setLogoError(problem);
    if (problem) {
      event.target.value = "";
      return;
    }
    setLogo({ kind: "replace", file });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (accentProblem || !changed) return;
    try {
      await save.mutateAsync({ currentLogo: savedLogo, change: { accent, logo } });
      toast.success(t("appearance.saved"));
    } catch (err) {
      errorToast(t("appearance.saveFailed"), err);
    }
  };

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success(t("appearance.resetDone"));
    } catch (err) {
      errorToast(t("appearance.resetFailed"), err);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-2" noValidate>
      <div className="min-w-0 space-y-6">
        <AccentPicker
          choice={choice}
          customCode={customCode}
          error={accentProblem}
          onChoose={setChoice}
          onCustomCode={setCustomCode}
        />
        <LogoField
          hasLogo={!!savedLogo}
          change={logo}
          error={logoError}
          onChoose={chooseLogo}
          onRemove={() => setLogo({ kind: "remove" })}
          onUndo={() => {
            setLogo({ kind: "keep" });
            setLogoError(null);
          }}
        />
        {savedLogoUrl.isError && logo.kind === "keep" && (
          <p role="alert" className="text-sm text-destructive">
            {t("appearance.logoLoadFailed")}{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => savedLogoUrl.refetch()}
            >
              {t("common.retry")}
            </Button>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={!!accentProblem || !changed || busy}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" disabled={!branding || busy} onClick={onReset}>
            {t("appearance.reset")}
          </Button>
        </div>
        {branding && <p className="text-xs text-muted-foreground">{t("appearance.resetHint")}</p>}
      </div>
      <ThemePreview accent={accentProblem ? null : accent} logo={previewLogo} />
    </form>
  );
}
