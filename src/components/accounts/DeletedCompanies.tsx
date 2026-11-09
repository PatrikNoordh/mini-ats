import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/States";
import { useDeleteCompanyNow, useRestoreCompany } from "@/hooks/useCompanies";
import { useErrorToast } from "@/hooks/useErrorToast";
import { purgeDate } from "@/lib/accounts";
import { ACCOUNT_DELETE_GRACE_DAYS } from "@/lib/constants";
import { useFormat } from "@/lib/format";
import type { Company } from "@/types";

/**
 * The deleted companies, each kept until its date (ATS-46): Återställ brings it back with its
 * users, Radera för gott deletes it now, with its CVs and its users' accounts, after the admin
 * types its name.
 */
export function DeletedCompanies({
  companies,
  memberCounts,
}: {
  companies: Company[];
  /** The number of users in each company, by id. */
  memberCounts: Map<string, number>;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const restore = useRestoreCompany();
  const deleteNow = useDeleteCompanyNow();
  const errorToast = useErrorToast();
  const [purging, setPurging] = useState<Company | null>(null);

  const onRestore = async (company: Company) => {
    try {
      await restore.mutateAsync(company.id);
      toast.success(t("accounts.companyRestored"));
    } catch (err) {
      errorToast(t("accounts.companyRestoreFailed"), err);
    }
  };

  const onDeleteNow = async () => {
    if (!purging) return;
    try {
      await deleteNow.mutateAsync(purging.id);
      toast.success(t("accounts.companyDeletedNow"));
    } catch (err) {
      errorToast(t("accounts.companyDeleteNowFailed"), err);
    }
    setPurging(null);
  };

  return (
    <section aria-labelledby="deleted-companies" className="mt-6">
      <h2 id="deleted-companies" className="text-lg font-bold">
        {t("accounts.deletedCompaniesTitle")}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t("accounts.deletedCompaniesHint", { days: ACCOUNT_DELETE_GRACE_DAYS })}
      </p>
      <div className="rounded-lg border bg-card">
        {companies.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("accounts.deletedCompaniesEmpty")} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accounts.company")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("accounts.usersColumn")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accounts.purgeColumn")}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t("accounts.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => {
                const date = c.deleted_at ? format.date(purgeDate(c.deleted_at).toISOString()) : "";
                const members = memberCounts.get(c.id) ?? 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="wrap-anywhere">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {t("accounts.members", { count: members })}
                      </div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {t("accounts.purgeOn", { date })}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {t("accounts.members", { count: members })}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {t("accounts.purgeOn", { date })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restore.isPending && restore.variables === c.id}
                          onClick={() => onRestore(c)}
                        >
                          {t("accounts.restore")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPurging(c)}
                        >
                          {t("accounts.deleteNow")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      {purging && (
        <ConfirmDeleteDialog
          open={!!purging}
          onOpenChange={(open) => !open && setPurging(null)}
          title={t("accounts.companyDeleteNowTitle")}
          description={t("accounts.companyDeleteNowDescription", { name: purging.name })}
          confirmLabel={t("accounts.deleteNow")}
          typeToConfirm={{
            text: purging.name,
            label: t("accounts.deleteNowType", { text: purging.name }),
          }}
          busy={deleteNow.isPending}
          onConfirm={onDeleteNow}
        />
      )}
    </section>
  );
}
