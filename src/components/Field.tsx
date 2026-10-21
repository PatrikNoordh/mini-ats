import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import type { ValidationKey } from "@/lib/validation";

/** The props that tie a control to its label, hint and error. Spread them on the control. */
export interface FieldControlProps {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/**
 * A label, one control, an optional hint and an optional error. The control gets the ids through
 * `children`, so a screen reader reads the hint and the error together with the control.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: ValidationKey | undefined;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const { t } = useTranslation();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {t(`validation.${error}`, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES })}
        </p>
      )}
    </div>
  );
}
