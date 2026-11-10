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
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Field } from "@/components/Field";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  useCreateProfile,
  useDeleteProfile,
  useProfiles,
  useUpdateProfile,
} from "@/hooks/useProfiles";
import { isActive, purgeDate } from "@/lib/accounts";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { useFormat } from "@/lib/format";
import {
  accountInputSchema,
  accountUpdateSchema,
  fieldErrors,
  roleSchema,
  type AccountInput,
  type FormErrors,
} from "@/lib/validation";
import type { Profile, Role } from "@/types";

const empty = { full_name: "", company_name: "", email: "", password: "" };

/** Creates an account, or edits and deletes `account` when it is given. */
export function AccountDialog({
  open,
  onOpenChange,
  account = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Profile | null;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { profile: me } = useAuth();
  const profiles = useProfiles();
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const remove = useDeleteProfile();
  const errorToast = useErrorToast();
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<AccountInput>>({});
  const [confirming, setConfirming] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const isSelf = !!account && account.id === me?.id;
  const busy = create.isPending || update.isPending || remove.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRole(account?.role ?? "customer");
    setForm(
      account
        ? {
            full_name: account.full_name,
            company_name: account.company_name,
            email: account.email,
            password: "",
          }
        : empty,
    );
  }, [open, account]);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /** A taken email says so under the field, and points to Borttagna konton when that is where it is. */
  const showEmailTaken = () => {
    const email = form.email.trim().toLowerCase();
    const deleted = (profiles.data ?? []).some(
      (p) => !isActive(p) && p.email.toLowerCase() === email,
    );
    setErrors({ email: deleted ? "email_taken_deleted" : "email_taken" });
    emailRef.current?.focus();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const schema = account ? accountUpdateSchema : accountInputSchema;
    const parsed = schema.safeParse({ ...form, role });
    setErrors(parsed.success ? {} : fieldErrors(schema, parsed.error));
    if (!parsed.success) return;
    try {
      if (account) {
        const { password, ...details } = parsed.data;
        await update.mutateAsync({ id: account.id, ...details, ...(password ? { password } : {}) });
        toast.success(t("accountDialog.updated"));
      } else {
        await create.mutateAsync(parsed.data);
        toast.success(t("accountDialog.created"));
      }
      onOpenChange(false);
    } catch (err) {
      if (errorCode(err) === "email_exists") return showEmailTaken();
      errorToast(t(account ? "accountDialog.updateFailed" : "accountDialog.createFailed"), err);
    }
  };

  const onDelete = async () => {
    if (!account) return;
    try {
      await remove.mutateAsync(account.id);
      toast.success(t("accountDialog.deleted"));
      setConfirming(false);
      onOpenChange(false);
    } catch (err) {
      errorToast(t("accountDialog.deleteFailed"), err);
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {account ? t("accountDialog.titleEdit") : t("accountDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            id="a-role"
            label={t("accountDialog.role")}
            // An admin cannot remove its own admin role (admin-manage-account refuses it too).
            hint={isSelf ? t("accountDialog.selfRoleHint") : undefined}
            error={errors.role}
          >
            {(control) => (
              <Select
                value={role}
                disabled={isSelf}
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
            label={account ? t("accountDialog.newPassword") : t("accountDialog.password")}
            hint={
              account
                ? t("accountDialog.newPasswordHint", { min: MIN_PASSWORD_LENGTH })
                : t("accountDialog.passwordHint", { min: MIN_PASSWORD_LENGTH })
            }
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
            {account && !isSelf && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t("common.delete")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {account
                ? update.isPending
                  ? t("common.saving")
                  : t("common.save")
                : create.isPending
                  ? t("accountDialog.submitting")
                  : t("accountDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {account && (
        <ConfirmDeleteDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("accountDialog.deleteTitle")}
          description={t("accountDialog.deleteDescription", {
            date: format.date(purgeDate(new Date()).toISOString()),
          })}
          busy={remove.isPending}
          onConfirm={onDelete}
        />
      )}
    </Dialog>
  );
}
