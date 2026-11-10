import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { AccountTable } from "@/components/accounts/AccountTable";
import { useDeleteCompany } from "@/hooks/useCompanies";
import { useErrorToast } from "@/hooks/useErrorToast";
import { purgeDate } from "@/lib/accounts";
import { useFormat } from "@/lib/format";
import type { Company, Profile } from "@/types";

/**
 * One active company and its users (ATS-46). A company without users keeps all its data until an
 * admin adds a user or deletes it; it is never deleted on its own.
 */
export function CompanyCard({
  company,
  members,
  onRename,
  onAddUser,
  onEdit,
}: {
  company: Company;
  members: Profile[];
  onRename: () => void;
  onAddUser: () => void;
  onEdit: (account: Profile) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const remove = useDeleteCompany();
  const errorToast = useErrorToast();
  const [confirming, setConfirming] = useState(false);
  const headingId = `company-${company.id}`;

  const onDelete = async () => {
    try {
      await remove.mutateAsync(company.id);
      toast.success(t("accounts.companyDeleted"));
    } catch (err) {
      errorToast(t("accounts.companyDeleteFailed"), err);
    }
    setConfirming(false);
  };

  return (
    <section aria-labelledby={headingId} className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h3 id={headingId} className="wrap-anywhere font-semibold">
            {company.name}
          </h3>
          {members.length === 0 ? (
            <Badge variant="outline">{t("accounts.noUsers")}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("accounts.members", { count: members.length })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("accounts.addUserLabel", { name: company.name })}
            onClick={onAddUser}
          >
            {t("accounts.addUser")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("accounts.renameCompanyLabel", { name: company.name })}
            onClick={onRename}
          >
            {t("accounts.renameCompany")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("accounts.deleteCompanyLabel", { name: company.name })}
            onClick={() => setConfirming(true)}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
      {members.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{t("accounts.noUsersHint")}</p>
      ) : (
        <AccountTable accounts={members} onEdit={onEdit} />
      )}
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("accounts.companyDeleteTitle")}
        description={t("accounts.companyDeleteDescription", {
          name: company.name,
          date: format.date(purgeDate(new Date()).toISOString()),
        })}
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </section>
  );
}
