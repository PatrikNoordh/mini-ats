import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccentPicker, type AccentChoice } from "@/components/settings/AccentPicker";
import { BackgroundField } from "@/components/settings/BackgroundField";
import { LogoField } from "@/components/settings/LogoField";
import { ThemePreview } from "@/components/settings/ThemePreview";
import { useBrandingUrl, useResetTheme, useSaveTheme } from "@/hooks/useBranding";
import { useErrorToast } from "@/hooks/useErrorToast";
import type { ImageChange } from "@/lib/branding";
import { prepareBackground } from "@/lib/prepare-background";
import { PRESET_ACCENTS } from "@/lib/theme";
import {
  accentError,
  backgroundSourceError,
  brandingImageError,
  type ValidationKey,
} from "@/lib/validation";
import type { BackgroundDim, CustomerBranding } from "@/types";

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

/** The image to preview for one image of the theme: the file chosen, none, or the saved one. */
function previewUrl(change: ImageChange, chosen: string | null, saved: string | null) {
  if (change.kind === "replace") return chosen;
  return change.kind === "remove" ? null : saved;
}

/**
 * The appearance settings (ATS-54, ATS-55): the colour, the logo, the background image and how
 * much of it shows, and a preview of them all before saving.
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
  const savedBackground = branding?.background_path ?? null;
  const savedDim = branding?.background_dim ?? "medium";
  const [choice, setChoice] = useState<AccentChoice>(() => choiceFor(saved));
  const [customCode, setCustomCode] = useState(() =>
    choiceFor(saved).kind === "custom" ? (saved ?? "") : "",
  );
  const [logo, setLogo] = useState<ImageChange>({ kind: "keep" });
  const [logoError, setLogoError] = useState<ValidationKey | null>(null);
  const [background, setBackground] = useState<ImageChange>({ kind: "keep" });
  const [backgroundError, setBackgroundError] = useState<ValidationKey | null>(null);
  const [dim, setDim] = useState<BackgroundDim>(savedDim);
  const [preparing, setPreparing] = useState(false);
  const save = useSaveTheme(customerId);
  const reset = useResetTheme(customerId);
  const savedLogoUrl = useBrandingUrl(customerId, savedLogo);
  const chosenLogoUrl = useObjectUrl(logo.kind === "replace" ? logo.file : null);
  const savedBackgroundUrl = useBrandingUrl(customerId, savedBackground);
  const chosenBackgroundUrl = useObjectUrl(background.kind === "replace" ? background.file : null);

  const accent =
    choice.kind === "default"
      ? null
      : choice.kind === "preset"
        ? choice.accent
        : customCode.trim().toLowerCase();
  const accentProblem = choice.kind === "custom" ? accentError(customCode) : null;
  // An empty code keeps Save disabled, but is not an error until something is typed.
  const shownAccentProblem = customCode.trim() ? accentProblem : null;
  const showsBackground =
    background.kind === "replace" || (background.kind === "keep" && !!savedBackground);
  const changed =
    accent !== saved ||
    logo.kind !== "keep" ||
    background.kind !== "keep" ||
    (showsBackground && dim !== savedDim);
  const busy = save.isPending || reset.isPending || preparing;

  const previewLogoUrl = previewUrl(logo, chosenLogoUrl, savedLogoUrl.data ?? null);
  const previewLogo = previewLogoUrl ? { src: previewLogoUrl, alt: companyName } : null;
  const previewBackgroundUrl = previewUrl(
    background,
    chosenBackgroundUrl,
    savedBackgroundUrl.data ?? null,
  );
  const previewBackground = previewBackgroundUrl ? { url: previewBackgroundUrl, dim } : null;

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

  // The file is made smaller in the browser first; the input is emptied either way, so choosing
  // the same file again still fires a change.
  const chooseBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const problem = backgroundSourceError(file);
    setBackgroundError(problem);
    if (problem) {
      input.value = "";
      return;
    }
    setPreparing(true);
    const prepared = await prepareBackground(file);
    setPreparing(false);
    input.value = "";
    if (typeof prepared === "string") {
      setBackgroundError(prepared);
      return;
    }
    setBackground({ kind: "replace", file: prepared });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (accentProblem || !changed) return;
    try {
      await save.mutateAsync({
        saved: { logo: savedLogo, background: savedBackground },
        change: { accent, logo, background, backgroundDim: dim },
      });
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
          error={shownAccentProblem}
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
        <BackgroundField
          hasBackground={!!savedBackground}
          showsBackground={showsBackground}
          change={background}
          dim={dim}
          preparing={preparing}
          error={backgroundError}
          onChoose={(event) => void chooseBackground(event)}
          onRemove={() => setBackground({ kind: "remove" })}
          onUndo={() => {
            setBackground({ kind: "keep" });
            setBackgroundError(null);
          }}
          onDim={setDim}
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
      <ThemePreview
        accent={accentProblem ? null : accent}
        logo={previewLogo}
        background={previewBackground}
      />
    </form>
  );
}
