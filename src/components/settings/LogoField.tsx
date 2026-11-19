import { Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "@/components/Field";
import { Button, buttonVariants } from "@/components/ui/button";
import type { LogoChange } from "@/lib/branding";
import { BRANDING_IMAGE_MIME_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";

/**
 * The logo part of the appearance settings (ATS-54). Says whether the company has a logo, which
 * file is chosen to replace it, or that it goes on save. As in the CV field, the real file input
 * stays focusable and labelled but is visually hidden, and a label styled as a button opens it.
 */
export function LogoField({
  hasLogo,
  change,
  error,
  onChoose,
  onRemove,
  onUndo,
}: {
  /** Whether the saved theme has a logo. */
  hasLogo: boolean;
  change: LogoChange;
  error: ValidationKey | null;
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  const undo = () => {
    // Emptied too, so choosing the same file again still fires a change.
    if (input.current) input.current.value = "";
    onUndo();
  };

  const status =
    change.kind === "replace"
      ? t("appearance.logoChosen", { name: change.file.name })
      : change.kind === "remove"
        ? t("appearance.logoRemovedOnSave")
        : hasLogo
          ? t("appearance.logoCurrent")
          : t("appearance.logoNone");

  return (
    <Field
      id="logo"
      label={t("appearance.logo")}
      hint={t("appearance.logoHint")}
      error={error ?? undefined}
    >
      {(control) => (
        <div className="space-y-2 text-sm">
          <p className="min-w-0 wrap-anywhere text-muted-foreground">{status}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              {...control}
              ref={input}
              type="file"
              accept={BRANDING_IMAGE_MIME_TYPES.join(",")}
              className="peer sr-only"
              onChange={onChoose}
            />
            <label
              htmlFor={control.id}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "peer-focus-visible:ring-1 peer-focus-visible:ring-ring",
              )}
            >
              <Upload aria-hidden="true" />
              {hasLogo ? t("appearance.logoReplace") : t("appearance.logoChoose")}
            </label>
            {hasLogo && change.kind === "keep" && (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                {t("appearance.logoRemove")}
              </Button>
            )}
            {change.kind !== "keep" && (
              <Button type="button" variant="ghost" size="sm" onClick={undo}>
                {t("appearance.logoUndo")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Field>
  );
}
