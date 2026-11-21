import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageField } from "@/components/settings/ImageField";
import type { ImageChange } from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";
import type { BackgroundDim } from "@/types";

const DIM_LEVELS: BackgroundDim[] = ["light", "medium", "strong"];

/**
 * The background image of the appearance settings (ATS-55), and how much of it shows. The dim
 * levels only change how much of the image shows: text always sits on solid surfaces.
 */
export function BackgroundField({
  hasBackground,
  showsBackground,
  change,
  dim,
  preparing,
  error,
  onChoose,
  onRemove,
  onUndo,
  onDim,
}: {
  hasBackground: boolean;
  /** Whether the draft has a background, so the dim level matters. */
  showsBackground: boolean;
  change: ImageChange;
  dim: BackgroundDim;
  preparing: boolean;
  error: ValidationKey | null;
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onUndo: () => void;
  onDim: (dim: BackgroundDim) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <ImageField
        id="background"
        hasImage={hasBackground}
        change={change}
        status={preparing ? t("appearance.backgroundPreparing") : null}
        error={error}
        disabled={preparing}
        text={{
          label: t("appearance.background"),
          hint: t("appearance.backgroundHint"),
          none: t("appearance.backgroundNone"),
          current: t("appearance.backgroundCurrent"),
          choose: t("appearance.backgroundChoose"),
          replace: t("appearance.backgroundReplace"),
          remove: t("appearance.backgroundRemove"),
          removedOnSave: t("appearance.backgroundRemovedOnSave"),
        }}
        onChoose={onChoose}
        onRemove={onRemove}
        onUndo={onUndo}
      />
      {showsBackground && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("appearance.dim")}</legend>
          <div className="flex flex-wrap gap-2">
            {DIM_LEVELS.map((level) => (
              <label
                key={level}
                className={cn(
                  "flex cursor-pointer items-center rounded-md border bg-card px-3 py-2 text-sm",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  dim === level && "border-primary ring-1 ring-primary",
                )}
              >
                <input
                  type="radio"
                  name="background-dim"
                  className="sr-only"
                  checked={dim === level}
                  onChange={() => onDim(level)}
                />
                {t(`appearance.dimLevels.${level}`)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
