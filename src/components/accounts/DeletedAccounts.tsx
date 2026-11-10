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
import { useErrorToast } from "@/hooks/useErrorToast";
import { useDeleteProfileNow, useRestoreProfile } from "@/hooks/useProfiles";
import { deleteConfirmText, purgeDate } from "@/lib/accounts";
import { ACCOUNT_DELETE_GRACE_DAYS } from "@/lib/constants";
import { useFormat } from "@/lib/format";
import type { Profile } from "@/types";

/**
 * The deleted accounts, each kept until its date: Återställ brings it back with everything in it,
 * Radera för gott deletes it now after the admin types its company name (or email).
 */
export function DeletedAccounts({ accounts }: { accounts: Profile[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  const restore = useRestoreProfile();
  const deleteNow = useDeleteProfileNow();
  const errorToast = useErrorToast();
  const [purging, setPurging] = useState<Profile | null>(null);

  const onRestore = async (account: Profile) => {
    try {
      await restore.mutateAsync(account.id);
      toast.success(t("accounts.restored"));
    } catch (err) {
      errorToast(t("accounts.restoreFailed"), err);
    }
  };

  const onDeleteNow = async () => {
    if (!purging) return;
    try {
      await deleteNow.mutateAsync(purging.id);
      toast.success(t("accounts.deletedNow"));
    } catch (err) {
      errorToast(t("accounts.deleteNowFailed"), err);
    }
    setPurging(null);
  };

  return (
    <section aria-labelledby="deleted-accounts" className="mt-6">
      <h2 id="deleted-accounts" className="text-lg font-bold">
        {t("accounts.deletedTitle")}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t("accounts.deletedHint", { days: ACCOUNT_DELETE_GRACE_DAYS })}
      </p>
      <div className="rounded-lg border bg-card">
        {accounts.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("accounts.deletedEmpty")} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("accounts.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("accounts.email")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("accounts.purgeColumn")}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{t("accounts.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const date = a.deleted_at ? format.date(purgeDate(a.deleted_at).toISOString()) : "";
                return (
                  <TableRow key={a.id}>
                    <TableCell className="wrap-anywhere">
                      <div className="font-semibold">
                        {a.company_name || a.full_name || a.email}
                      </div>
                      <div className="text-xs text-muted-foreground">{a.full_name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {t("accounts.purgeOn", { date })}
                      </div>
                    </TableCell>
                    <TableCell className="hidden wrap-anywhere sm:table-cell">{a.email}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {t("accounts.purgeOn", { date })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restore.isPending && restore.variables === a.id}
                          onClick={() => onRestore(a)}
                        >
                          {t("accounts.restore")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPurging(a)}
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
          title={t("accounts.deleteNowTitle")}
          description={t("accounts.deleteNowDescription", {
            name: purging.company_name || purging.email,
          })}
          confirmLabel={t("accounts.deleteNow")}
          typeToConfirm={{
            text: deleteConfirmText(purging),
            label: t("accounts.deleteNowType", { text: deleteConfirmText(purging) }),
          }}
          busy={deleteNow.isPending}
          onConfirm={onDeleteNow}
        />
      )}
    </section>
  );
}
