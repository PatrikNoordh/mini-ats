import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/Field";
import { useCreateProfile } from "@/hooks/useProfiles";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import {
  accountInputSchema,
  fieldErrors,
  roleSchema,
  type AccountInput,
  type FormErrors,
} from "@/lib/validation";
import type { Role } from "@/types";

const empty = { full_name: "", company_name: "", email: "", password: "" };

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProfile();
  const errorToast = useErrorToast();
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<AccountInput>>({});
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setForm(empty);
      setRole("customer");
      setErrors({});
    }
  }, [open]);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = accountInputSchema.safeParse({ ...form, role });
    setErrors(parsed.success ? {} : fieldErrors(accountInputSchema, parsed.error));
    if (!parsed.success) return;
    try {
      await create.mutateAsync(parsed.data);
      toast.success(t("accountDialog.created"));
      onOpenChange(false);
    } catch (err) {
      const code = errorCode(err);
      if (code === "email_exists") {
        // The error belongs to the email field, so show it there instead of in a toast.
        setErrors({ email: "email_taken" });
        emailRef.current?.focus();
        return;
      }
      errorToast(t("accountDialog.createFailed"), err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accountDialog.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="a-role" label={t("accountDialog.role")} error={errors.role}>
            {(control) => (
              <Select
                value={role}
                onValueChange={(value) => {
                  const parsed = roleSchema.safeParse(value);
                  if (parsed.success) setRole(parsed.data);
                }}
              >
                <SelectTrigger {...control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{t("roles.customer")}</SelectItem>
                  <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field id="a-name" label={t("accountDialog.name")} error={errors.full_name}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_NAME_LENGTH}
                value={form.full_name}
                onChange={set("full_name")}
              />
            )}
          </Field>
          <Field id="a-co" label={t("accountDialog.company")} error={errors.company_name}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_NAME_LENGTH}
                value={form.company_name}
                onChange={set("company_name")}
              />
            )}
          </Field>
          <Field id="a-email" label={t("accountDialog.email")} error={errors.email}>
            {(control) => (
              <Input
                {...control}
                ref={emailRef}
                type="email"
                maxLength={MAX_EMAIL_LENGTH}
                value={form.email}
                onChange={set("email")}
              />
            )}
          </Field>
          <Field
            id="a-pw"
            label={t("accountDialog.password")}
            hint={t("accountDialog.passwordHint", { min: MIN_PASSWORD_LENGTH })}
            error={errors.password}
          >
            {(control) => (
              <Input
                {...control}
                type="text"
                autoComplete="off"
                // Characters, so never stricter than the byte limit the schema checks.
                maxLength={MAX_PASSWORD_BYTES}
                value={form.password}
                onChange={set("password")}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("accountDialog.submitting") : t("accountDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
