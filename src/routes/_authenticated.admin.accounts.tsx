import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { AccountDialog } from "@/components/accounts/AccountDialog";
import { DeletedAccounts } from "@/components/accounts/DeletedAccounts";
import { useProfiles } from "@/hooks/useProfiles";
import { isActive } from "@/lib/accounts";
import { useFormat } from "@/lib/format";
import { pageHead } from "@/lib/i18n";
import type { Profile } from "@/types";

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
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const active = (profiles.data ?? []).filter(isActive);
  const deleted = (profiles.data ?? []).filter((p) => !isActive(p));
  const openDialog = (account: Profile | null) => {
    setEditing(account);
    setOpen(true);
  };
  return (
    <div>
      <PageHeader
        title={t("accounts.title")}
        meta={t("accounts.adminOnly")}
        action={<Button onClick={() => openDialog(null)}>{t("accounts.new")}</Button>}
      />
      <div className="rounded-lg border bg-card">
        {profiles.isLoading ? (
          <LoadingRows rows={3} />
        ) : profiles.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => profiles.refetch()} />
          </div>
        ) : active.length === 0 ? (
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
              {active.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="wrap-anywhere">
                    <button
                      className="text-left font-semibold text-primary hover:underline"
                      aria-label={t("accounts.edit", { name: p.full_name || p.email })}
                      onClick={() => openDialog(p)}
                    >
                      {p.full_name || p.email}
                    </button>
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
      {profiles.isSuccess && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showDeleted}
            aria-controls="deleted-accounts-list"
            onClick={() => setShowDeleted((shown) => !shown)}
          >
            {showDeleted
              ? t("accounts.hideDeleted")
              : t("accounts.showDeleted", { count: deleted.length })}
          </Button>
          {showDeleted && (
            <div id="deleted-accounts-list">
              <DeletedAccounts accounts={deleted} />
            </div>
          )}
        </div>
      )}
      <AccountDialog open={open} onOpenChange={setOpen} account={editing} />
    </div>
  );
}
