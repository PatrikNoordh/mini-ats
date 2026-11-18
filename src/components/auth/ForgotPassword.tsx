import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "@/components/auth/AuthCard";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/api/auth";
import { MAX_EMAIL_LENGTH } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import {
  fieldErrors,
  passwordResetSchema,
  type FormErrors,
  type PasswordResetInput,
} from "@/lib/validation";

/**
 * Where a user who forgot their password asks for a link to choose a new one (ATS-51). The answer
 * is the same whether the address has an account or not, so the page never tells anyone which
 * addresses do.
 */
export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FormErrors<PasswordResetInput>>({});
  const [error, setError] = useState<ReturnType<typeof errorCode> | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = passwordResetSchema.safeParse({ email });
    setErrors(parsed.success ? {} : fieldErrors(passwordResetSchema, parsed.error));
    if (!parsed.success) return;
    setBusy(true);
    try {
      await requestPasswordReset(parsed.data.email);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("forgotPassword.title")}>
      {sentTo ? (
        <p role="status" className="mt-4 text-sm">
          {t("forgotPassword.sent", { email: sentTo })}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{t("forgotPassword.subtitle")}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field id="email" label={t("forgotPassword.email")} error={errors.email}>
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  autoComplete="email"
                  maxLength={MAX_EMAIL_LENGTH}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t(`errors.${error}`)}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </Button>
          </form>
        </>
      )}
      <Button asChild variant="link" className="mt-4 w-full">
        <Link to="/login">{t("forgotPassword.toLogin")}</Link>
      </Button>
    </AuthCard>
  );
}
