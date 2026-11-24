import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageField } from "@/components/settings/ImageField";
import { Label } from "@/components/ui/label";
import { useFormat } from "@/lib/format";
import type { ImageChange } from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";
import type { BackgroundDim } from "@/types";

const DIM_LEVELS: BackgroundDim[] = ["light", "medium", "strong"];

/**
 * The background image of the appearance settings (ATS-55), and how much of it shows. The dim
 * levels only change how much of the image shows. The chips' setting (ATS-66) says how much
 * shows through the loose text's chips, from fully solid up to what the image's floor allows.
 */

/** The chips' setting as the field shows it: how much shows through, in whole percent. */
export interface ChipSetting {
  /** How much of the image shows through, 0 to `max`. */
  value: number;
  /** The most this image allows, or null when it has no measured floor. */
  max: number | null;
  measuring: boolean;
  onChange: (value: number) => void;
}
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
  chips,
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
  chips: ChipSetting;
}) {
  const { t } = useTranslation();
  const format = useFormat();
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
      {showsBackground && (
        <div className="space-y-1.5">
          <Label htmlFor="chip-visibility">{t("appearance.surface")}</Label>
          {chips.measuring ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("appearance.surfaceMeasuring")}
            </p>
          ) : chips.max === null ? (
            <p className="text-xs text-muted-foreground">{t("appearance.surfaceUnmeasured")}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <input
                  id="chip-visibility"
                  type="range"
                  min={0}
                  max={chips.max}
                  step={1}
                  value={chips.value}
                  aria-describedby="chip-visibility-hint"
                  aria-valuetext={t("appearance.surfaceValue", {
                    value: format.number(chips.value),
                  })}
                  className="w-full max-w-xs cursor-pointer accent-primary"
                  onChange={(e) => chips.onChange(Number(e.target.value))}
                />
                <span className="shrink-0 text-sm tabular-nums">
                  {t("appearance.surfaceValue", { value: format.number(chips.value) })}
                </span>
              </div>
              <p id="chip-visibility-hint" className="text-xs text-muted-foreground">
                {t("appearance.surfaceHint", { max: format.number(chips.max) })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
