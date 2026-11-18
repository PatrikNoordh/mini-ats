import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useCompanies } from "@/hooks/useCompanies";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  useCreateProfile,
  useDeleteProfile,
  useProfiles,
  useResendInvite,
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
import { EMAIL_ENABLED } from "@/lib/features";
import { useFormat } from "@/lib/format";
import {
  accountFormFields,
  accountInputSchema,
  accountInviteSchema,
  accountUpdateSchema,
  fieldErrors,
  NEW_COMPANY,
  NO_COMPANY,
  roleSchema,
  type AccountInput,
  type FormErrors,
} from "@/lib/validation";
import type { Profile, Role } from "@/types";

const empty = { full_name: "", email: "", password: "", company: "", company_name: "" };

/** How a new user gets in: an invite by email, or a temporary password the admin hands over. */
type Access = "invite" | "password";
/** Invites first when email works here (ATS-50); otherwise a password, as before. */
const DEFAULT_ACCESS: Access = EMAIL_ENABLED ? "invite" : "password";

/**
 * Creates an account, or edits and deletes `account` when it is given. A customer belongs to a
 * company: an existing one, a new one when the account is created, or none after an edit
 * (ATS-46). The company's name is changed on the company, not here.
 */
export function AccountDialog({
  open,
  onOpenChange,
  account = null,
  companyId = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Profile | null;
  /**
   * The company a new account is added to, from the company's own "Add user". The dialog is then
   * tied to it: the company is fixed text and there is no role to choose, since an admin is never
   * a member (ATS-62).
   */
  companyId?: string | null;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { profile: me } = useAuth();
  const profiles = useProfiles();
  const companies = useCompanies();
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const remove = useDeleteProfile();
  const resend = useResendInvite();
  const errorToast = useErrorToast();
  const [role, setRole] = useState<Role>("customer");
  const [access, setAccess] = useState<Access>(DEFAULT_ACCESS);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors<AccountInput>>({});
  const [confirming, setConfirming] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const isSelf = !!account && account.id === me?.id;
  const tied = !account && companyId !== null;
  const tiedCompany = tied ? companies.data?.find((c) => c.id === companyId) : undefined;
  const busy = create.isPending || update.isPending || remove.isPending || resend.isPending;
  const inviting = !account && access === "invite";

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRole(account?.role ?? "customer");
    setAccess(DEFAULT_ACCESS);
    setForm(
      account
        ? {
            ...empty,
            full_name: account.full_name,
            email: account.email,
            company: account.company_id ?? (account.role === "customer" ? NO_COMPANY : ""),
          }
        : { ...empty, company: companyId ?? "" },
    );
  }, [open, account, companyId]);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  // The active companies to choose from, and the account's own even if it is deleted, so the
  // choice shows what it is now.
  const choices = (companies.data ?? []).filter((c) => isActive(c) || c.id === account?.company_id);

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
    const schema = account
      ? accountUpdateSchema
      : inviting
        ? accountInviteSchema
        : accountInputSchema;
    const parsed = schema.safeParse({ ...form, role });
    setErrors(parsed.success ? {} : fieldErrors(accountFormFields, parsed.error));
    if (!parsed.success) return;
    const { password, company, company_name, ...details } = parsed.data;
    const isCustomer = details.role === "customer";
    try {
      if (account) {
        // The membership is sent only when it changes. Promoting to admin removes it in the
        // database, so it is never sent for an admin.
        const initial = account.company_id ?? NO_COMPANY;
        const move =
          isCustomer && company !== initial
            ? { company_id: company === NO_COMPANY ? null : company }
            : {};
        await update.mutateAsync({
          id: account.id,
          ...details,
          ...move,
          ...(password ? { password } : {}),
        });
        toast.success(t("accountDialog.updated"));
      } else {
        const placement = !isCustomer
          ? {}
          : company === NEW_COMPANY
            ? { company_name }
            : { company_id: company };
        if (inviting) {
          await create.mutateAsync({ ...details, invite: true, ...placement });
          toast.success(t("accountDialog.invited", { email: details.email }));
        } else {
          await create.mutateAsync({ ...details, password, ...placement });
          toast.success(t("accountDialog.created"));
        }
      }
      onOpenChange(false);
    } catch (err) {
      if (errorCode(err) === "email_exists") return showEmailTaken();
      errorToast(t(account ? "accountDialog.updateFailed" : "accountDialog.createFailed"), err);
    }
  };

  /** Emails a new invite; the function refuses an account that already has a password. */
  const onResend = async () => {
    if (!account) return;
    try {
      await resend.mutateAsync(account.id);
      toast.success(t("accountDialog.resent", { email: account.email }));
    } catch (err) {
      errorToast(t("accountDialog.resendFailed"), err);
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
          {account && (
            <Link
              to="/admin/accounts/$accountId/history"
              params={{ accountId: account.id }}
              className="w-fit text-sm text-primary hover:underline"
            >
              {t("accounts.showHistory")}
            </Link>
          )}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {/* The page has already loaded the companies, so the name is there when it opens. */}
          {tiedCompany && (
            <dl className="text-sm">
              <dt className="font-medium">{t("accountDialog.company")}</dt>
              <dd className="mt-1 wrap-anywhere text-muted-foreground">{tiedCompany.name}</dd>
            </dl>
          )}
          {!tied && (
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
          )}
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
          {role === "customer" && !tied && (
            <Field id="a-co" label={t("accountDialog.company")} error={errors.company}>
              {(control) => (
                <Select
                  value={form.company}
                  onValueChange={(value) => setForm((f) => ({ ...f, company: value }))}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder={t("accountDialog.chooseCompany")} />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {isActive(c) ? c.name : t("accountDialog.deletedCompany", { name: c.name })}
                      </SelectItem>
                    ))}
                    {account ? (
                      <SelectItem value={NO_COMPANY}>{t("accountDialog.noCompany")}</SelectItem>
                    ) : (
                      <SelectItem value={NEW_COMPANY}>{t("accountDialog.newCompany")}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
          {role === "customer" && !account && form.company === NEW_COMPANY && (
            <Field
              id="a-new-co"
              label={t("accountDialog.newCompanyName")}
              error={errors.company_name}
            >
              {(control) => (
                <Input
                  {...control}
                  maxLength={MAX_NAME_LENGTH}
                  value={form.company_name}
                  onChange={set("company_name")}
                />
              )}
            </Field>
          )}
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
          {!account && EMAIL_ENABLED && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("accountDialog.access")}</legend>
              <RadioGroup
                value={access}
                onValueChange={(value) => setAccess(value === "password" ? "password" : "invite")}
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    id="a-access-invite"
                    value="invite"
                    aria-describedby="a-access-invite-hint"
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="a-access-invite">{t("accountDialog.accessInvite")}</Label>
                    <p id="a-access-invite-hint" className="text-xs text-muted-foreground">
                      {t("accountDialog.accessInviteHint")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="a-access-password" value="password" />
                  <Label htmlFor="a-access-password">{t("accountDialog.accessPassword")}</Label>
                </div>
              </RadioGroup>
            </fieldset>
          )}
          {!inviting && (
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
          )}
          {account && !isSelf && EMAIL_ENABLED && (
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-describedby="a-resend-hint"
                onClick={() => void onResend()}
              >
                {resend.isPending ? t("accountDialog.sending") : t("accountDialog.resendInvite")}
              </Button>
              <p id="a-resend-hint" className="text-xs text-muted-foreground">
                {t("accountDialog.resendHint")}
              </p>
            </div>
          )}
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
                  ? inviting
                    ? t("accountDialog.sending")
                    : t("accountDialog.submitting")
                  : inviting
                    ? t("accountDialog.submitInvite")
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
