import { useTranslation } from "react-i18next";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { useFormat } from "@/lib/format";
import { MIN_TEXT_CONTRAST, MIN_UI_CONTRAST } from "@/lib/constants";
import { accentContrast, PRESET_ACCENTS } from "@/lib/theme";
import { isHexColour } from "@/lib/contrast";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";

/** Which accent is chosen: the Mini-ATS one, a preset by name, or the customer's own code. */
export type AccentChoice =
  { kind: "default" } | { kind: "preset"; accent: string } | { kind: "custom" };

/** A contrast ratio rounded down to one decimal, so the page never claims more than it has. */
const roundDown = (ratio: number) => Math.floor(ratio * 10) / 10;

/**
 * The colour part of the appearance settings (ATS-54): the Mini-ATS accent, six presets known to
 * be readable, or a colour code of the customer's own, checked as it is typed. Each option is a
 * radio button, so the keyboard moves between them with the arrow keys. A swatch's colour is a
 * runtime value from the presets or the customer, so it is set as a style.
 */
export function AccentPicker({
  choice,
  customCode,
  error,
  onChoose,
  onCustomCode,
}: {
  choice: AccentChoice;
  customCode: string;
  error: ValidationKey | null;
  onChoose: (choice: AccentChoice) => void;
  onCustomCode: (code: string) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const code = customCode.trim().toLowerCase();
  const contrast = isHexColour(code) ? accentContrast(code) : null;

  const option = (
    key: string,
    label: string,
    swatch: string | null,
    chosen: boolean,
    pick: () => void,
  ) => (
    <label
      key={key}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        chosen && "border-primary ring-1 ring-primary",
      )}
    >
      <input type="radio" name="accent" className="sr-only" checked={chosen} onChange={pick} />
      <span
        aria-hidden="true"
        className={cn("h-5 w-5 shrink-0 rounded-full border", !swatch && "bg-mini-ats-primary")}
        style={swatch ? { backgroundColor: swatch } : undefined}
      />
      {label}
    </label>
  );

  return (
    <fieldset className="space-y-3">
      <legend className="chip-on-image text-sm font-medium">{t("appearance.colour")}</legend>
      <p className="chip-on-image text-xs text-muted-foreground">{t("appearance.colourHint")}</p>
      <div className="flex flex-wrap gap-2">
        {option("default", t("appearance.default"), null, choice.kind === "default", () =>
          onChoose({ kind: "default" }),
        )}
        {PRESET_ACCENTS.map(({ name, accent }) =>
          option(
            name,
            t(`appearance.presets.${name}`),
            accent,
            choice.kind === "preset" && choice.accent === accent,
            () => onChoose({ kind: "preset", accent }),
          ),
        )}
        {option(
          "custom",
          t("appearance.custom"),
          isHexColour(code) ? code : null,
          choice.kind === "custom",
          () => onChoose({ kind: "custom" }),
        )}
      </div>
      {choice.kind === "custom" && (
        <div className="max-w-md">
          <Field
            id="accent-code"
            label={t("appearance.customCode")}
            hint={
              contrast
                ? t("appearance.contrast", {
                    text: format.number(roundDown(contrast.text)),
                    minText: format.number(MIN_TEXT_CONTRAST),
                    background: format.number(roundDown(contrast.background)),
                    minBackground: format.number(MIN_UI_CONTRAST),
                  })
                : undefined
            }
            error={error ?? undefined}
          >
            {(control) => (
              <div className="flex items-center gap-2">
                <Input
                  {...control}
                  className="w-40"
                  value={customCode}
                  placeholder={PRESET_ACCENTS[0].accent}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => onCustomCode(e.target.value)}
                />
                <input
                  type="color"
                  aria-label={t("appearance.customPicker")}
                  className="h-9 w-12 cursor-pointer rounded-md border bg-card p-1"
                  value={isHexColour(code) ? code : PRESET_ACCENTS[0].accent}
                  onChange={(e) => onCustomCode(e.target.value)}
                />
              </div>
            )}
          </Field>
        </div>
      )}
    </fieldset>
  );
}
