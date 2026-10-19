import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireAdmin } from "@/components/auth/Guards";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { Field, type FormErrors } from "@/components/candidates/CandidateDialog";
import { useCreateProfile, useProfiles } from "@/hooks/useProfiles";
import { errorCode } from "@/lib/errors";
import { useFormat } from "@/lib/format";
import { pageHead } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { isEmail } from "@/lib/validation";
import type { Role } from "@/types";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  head: ({ match }) => pageHead(match.context.language, "accounts"),
  component: () => (
    <RequireAdmin>
      <Accounts />
    </RequireAdmin>
  ),
});

function Accounts() {
  const { t } = useTranslation();
  const format = useFormat();
  const profiles = useProfiles();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader
        title={t("accounts.title")}
        meta={t("accounts.adminOnly")}
        action={<Button onClick={() => setOpen(true)}>{t("accounts.new")}</Button>}
      />
      <div className="rounded-lg border bg-card">
        {profiles.isLoading ? (
          <LoadingRows rows={3} />
        ) : profiles.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => profiles.refetch()} />
          </div>
        ) : !profiles.data?.length ? (
          <div className="p-4">
            <EmptyState title={t("accounts.empty")} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accounts.name")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accounts.company")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("accounts.email")}</TableHead>
                <TableHead>{t("accounts.role")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accounts.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-semibold">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{p.company_name}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.company_name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{p.email}</TableCell>
                  <TableCell>
                    <Badge variant={p.role === "admin" ? "default" : "outline"}>
                      {t(`roles.${p.role}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {format.date(p.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

const empty = { full_name: "", company_name: "", email: "", password: "" };

function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProfile();
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors>({});
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
    const errs: FormErrors = {};
    if (!form.full_name.trim()) errs.full_name = "name_required";
    if (!form.company_name.trim()) errs.company_name = "company_required";
    if (!isEmail(form.email)) errs.email = "email_invalid";
    if (form.password.length < MIN_PASSWORD_LENGTH) errs.password = "password_too_short";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await create.mutateAsync({ ...form, email: form.email.trim(), role });
      toast.success(t("accountDialog.created"));
      onOpenChange(false);
    } catch (err) {
      toast.error(t(`errors.${errorCode(err)}`));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accountDialog.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="a-role" label={t("accountDialog.role")}>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="a-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{t("roles.customer")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="a-name" label={t("accountDialog.name")} error={errors.full_name}>
            <Input id="a-name" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field id="a-co" label={t("accountDialog.company")} error={errors.company_name}>
            <Input id="a-co" value={form.company_name} onChange={set("company_name")} />
          </Field>
          <Field id="a-email" label={t("accountDialog.email")} error={errors.email}>
            <Input id="a-email" type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field id="a-pw" label={t("accountDialog.password")} error={errors.password}>
            <Input id="a-pw" type="text" value={form.password} onChange={set("password")} />
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
