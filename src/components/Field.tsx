import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import type { ValidationKey } from "@/lib/validation";

export type FormErrors = Partial<
  Record<
    | "full_name"
    | "email"
    | "linkedin_url"
    | "company_name"
    | "password"
    | "title"
    | "location"
    | "description",
    ValidationKey
  >
>;

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: ValidationKey | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive">
          {t(`validation.${error}`, { min: MIN_PASSWORD_LENGTH })}
        </p>
      )}
    </div>
  );
}
