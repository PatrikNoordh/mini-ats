import { Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "@/components/Field";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ImageChange } from "@/lib/branding";
import { BRANDING_IMAGE_MIME_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";

/** The texts of one image field: what to call it and what to say in each state. */
export interface ImageFieldText {
  label: string;
  hint: string;
  none: string;
  current: string;
  choose: string;
  replace: string;
  remove: string;
  removedOnSave: string;
}

/**
 * An image of the theme on the settings page, the logo (ATS-54) or the background (ATS-55). Says
 * whether the company has one, which file is chosen to replace it, or that it goes on save. As in
 * the CV field, the real file input stays focusable and labelled but is visually hidden, and a
 * label styled as a button opens it.
 */
export function ImageField({
  id,
  text,
  hasImage,
  change,
  status,
  error,
  disabled,
  onChoose,
  onRemove,
  onUndo,
}: {
  id: string;
  text: ImageFieldText;
  /** Whether the saved theme has this image. */
  hasImage: boolean;
  change: ImageChange;
  /** A message that replaces the status line while the file is being prepared. */
  status?: string | null;
  error: ValidationKey | null;
  disabled?: boolean;
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

  const line =
    status ??
    (change.kind === "replace"
      ? t("appearance.logoChosen", { name: change.file.name })
      : change.kind === "remove"
        ? text.removedOnSave
        : hasImage
          ? text.current
          : text.none);

  return (
    <Field id={id} label={text.label} hint={text.hint} error={error ?? undefined}>
      {(control) => (
        <div className="space-y-2 text-sm">
          <p
            className="chip-on-image min-w-0 wrap-anywhere text-muted-foreground"
            aria-live="polite"
          >
            {line}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              {...control}
              ref={input}
              type="file"
              accept={BRANDING_IMAGE_MIME_TYPES.join(",")}
              className="peer sr-only"
              disabled={disabled}
              onChange={onChoose}
            />
            <label
              htmlFor={control.id}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "peer-focus-visible:ring-1 peer-focus-visible:ring-ring",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <Upload aria-hidden="true" />
              {hasImage ? text.replace : text.choose}
            </label>
            {hasImage && change.kind === "keep" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="chip-on-image"
                onClick={onRemove}
              >
                {text.remove}
              </Button>
            )}
            {change.kind !== "keep" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="chip-on-image"
                onClick={undo}
              >
                {t("appearance.logoUndo")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Field>
  );
}
