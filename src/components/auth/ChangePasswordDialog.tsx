import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { useChangePassword } from "@/hooks/useChangePassword";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { errorCode, type ErrorCode } from "@/lib/errors";
import {
  fieldErrors,
  passwordChangeSchema,
  type FormErrors,
  type PasswordChangeInput,
} from "@/lib/validation";

const empty: PasswordChangeInput = { current_password: "", new_password: "", confirm_password: "" };

/**
 * Lets the signed-in user choose their own password, so only they know it (ATS-34). Names the
 * signed-in account, which for an admin acting for a customer is the admin, not the customer.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<PasswordChangeInput>>({});
  const [failure, setFailure] = useState<ErrorCode | "unknown" | null>(null);

  // A fresh form every time it opens: passwords never stay in the dialog.
  useEffect(() => {
    if (!open) return;
    setForm(empty);
    setErrors({});
    setFailure(null);
  }, [open]);

  const set = (key: keyof PasswordChangeInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (change.isPending) return;
    const parsed = passwordChangeSchema.safeParse(form);
    setErrors(parsed.success ? {} : fieldErrors(passwordChangeSchema.innerType(), parsed.error));
    setFailure(null);
    if (!parsed.success) return;
    try {
      const result = await change.mutateAsync({
        current: parsed.data.current_password,
        next: parsed.data.new_password,
      });
      if (result.otherSessionsSignedOut) toast.success(t("changePassword.done"));
      else toast.warning(t("changePassword.doneOthersKept"));
      onOpenChange(false);
    } catch (err) {
      setFailure(errorCode(err));
    }
  };

  const hint = t("changePassword.hint", { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES });
  return (
    <Dialog open={open} onOpenChange={(o) => !change.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changePassword.title")}</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {t("changePassword.description", { email })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            id="pw-current"
            label={t("changePassword.current")}
            error={errors.current_password}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="current-password"
                value={form.current_password}
                onChange={set("current_password")}
              />
            )}
          </Field>
          <Field
            id="pw-new"
            label={t("changePassword.new")}
            hint={hint}
            error={errors.new_password}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={set("new_password")}
              />
            )}
          </Field>
          <Field
            id="pw-confirm"
            label={t("changePassword.confirm")}
            error={errors.confirm_password}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={set("confirm_password")}
              />
            )}
          </Field>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${failure}`)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={change.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? t("common.saving") : t("changePassword.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
