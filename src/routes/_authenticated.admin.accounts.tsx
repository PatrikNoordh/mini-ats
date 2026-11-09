import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RequireAdmin } from "@/components/auth/Guards";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { AccountDialog } from "@/components/accounts/AccountDialog";
import { AccountTable } from "@/components/accounts/AccountTable";
import { CompanyCard } from "@/components/accounts/CompanyCard";
import { CompanyDialog } from "@/components/accounts/CompanyDialog";
import { DeletedAccounts } from "@/components/accounts/DeletedAccounts";
import { DeletedCompanies } from "@/components/accounts/DeletedCompanies";
import { useCompanies } from "@/hooks/useCompanies";
import { useProfiles } from "@/hooks/useProfiles";
import { isActive } from "@/lib/accounts";
import { pageHead } from "@/lib/i18n";
import type { Company, Profile } from "@/types";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  head: ({ match }) => pageHead(match.context.language, "accounts"),
  component: () => (
    <RequireAdmin>
      <Accounts />
    </RequireAdmin>
  ),
});

/** A titled part of the page. */
function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-6 first:mt-0">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** A button that shows or hides the list it controls. */
function Toggle({
  shown,
  controls,
  label,
  onToggle,
}: {
  shown: boolean;
  controls: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
    >
      {label}
    </Button>
  );
}

/**
 * The companies with their users, the users without a company, and the admins (ATS-46). An admin
 * creates, renames and deletes companies, and adds, moves and removes users through the account
 * dialog. Deleted companies and accounts are kept for 30 days and can be restored.
 */
function Accounts() {
  const { t } = useTranslation();
  const profiles = useProfiles();
  const companies = useCompanies();
  const [accountDialog, setAccountDialog] = useState<{
    open: boolean;
    account: Profile | null;
    companyId: string | null;
  }>({ open: false, account: null, companyId: null });
  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; company: Company | null }>({
    open: false,
    company: null,
  });
  const [showDeletedCompanies, setShowDeletedCompanies] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const accounts = profiles.data ?? [];
  const active = accounts.filter(isActive);
  const membersOf = (companyId: string) => active.filter((p) => p.company_id === companyId);
  const activeCompanies = (companies.data ?? []).filter(isActive);
  const deletedCompanies = (companies.data ?? []).filter((c) => !isActive(c));
  const withoutCompany = active.filter((p) => p.role === "customer" && p.company_id === null);
  const admins = active.filter((p) => p.role === "admin");
  const deleted = accounts.filter((p) => !isActive(p));
  const memberCounts = new Map(
    deletedCompanies.map((c) => [c.id, accounts.filter((p) => p.company_id === c.id).length]),
  );

  const editAccount = (account: Profile) =>
    setAccountDialog({ open: true, account, companyId: null });
  const addUser = (companyId: string | null) =>
    setAccountDialog({ open: true, account: null, companyId });

  const isLoading = profiles.isLoading || companies.isLoading;
  const isError = profiles.isError || companies.isError;
  const retry = () => {
    if (profiles.isError) void profiles.refetch();
    if (companies.isError) void companies.refetch();
  };

  return (
    <div>
      <PageHeader
        title={t("accounts.title")}
        meta={t("accounts.adminOnly")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setCompanyDialog({ open: true, company: null })}
            >
              {t("accounts.newCompany")}
            </Button>
            <Button onClick={() => addUser(null)}>{t("accounts.new")}</Button>
          </div>
        }
      />
      {isLoading ? (
        <div className="rounded-lg border bg-card">
          <LoadingRows rows={3} />
        </div>
      ) : isError ? (
        <div className="rounded-lg border bg-card p-4">
          <ErrorState onRetry={retry} />
        </div>
      ) : (
        <>
          <Section
            id="companies"
            title={t("accounts.companiesTitle")}
            hint={t("accounts.companiesHint")}
          >
            {activeCompanies.length === 0 ? (
              <div className="rounded-lg border bg-card p-4">
                <EmptyState title={t("accounts.companiesEmpty")} />
              </div>
            ) : (
              <div className="space-y-3">
                {activeCompanies.map((c) => (
                  <CompanyCard
                    key={c.id}
                    company={c}
                    members={membersOf(c.id)}
                    onRename={() => setCompanyDialog({ open: true, company: c })}
                    onAddUser={() => addUser(c.id)}
                    onEdit={editAccount}
                  />
                ))}
              </div>
            )}
          </Section>
          {withoutCompany.length > 0 && (
            <Section
              id="without-company"
              title={t("accounts.withoutCompanyTitle")}
              hint={t("accounts.withoutCompanyHint")}
            >
              <div className="rounded-lg border bg-card">
                <AccountTable accounts={withoutCompany} onEdit={editAccount} />
              </div>
            </Section>
          )}
          <Section id="admins" title={t("accounts.adminsTitle")}>
            <div className="rounded-lg border bg-card">
              <AccountTable accounts={admins} onEdit={editAccount} />
            </div>
          </Section>
          <div className="mt-6 flex flex-wrap gap-2">
            <Toggle
              shown={showDeletedCompanies}
              controls="deleted-companies-list"
              label={
                showDeletedCompanies
                  ? t("accounts.hideDeletedCompanies")
                  : t("accounts.showDeletedCompanies", { count: deletedCompanies.length })
              }
              onToggle={() => setShowDeletedCompanies((shown) => !shown)}
            />
            <Toggle
              shown={showDeleted}
              controls="deleted-accounts-list"
              label={
                showDeleted
                  ? t("accounts.hideDeleted")
                  : t("accounts.showDeleted", { count: deleted.length })
              }
              onToggle={() => setShowDeleted((shown) => !shown)}
            />
          </div>
          {showDeletedCompanies && (
            <div id="deleted-companies-list">
              <DeletedCompanies companies={deletedCompanies} memberCounts={memberCounts} />
            </div>
          )}
          {showDeleted && (
            <div id="deleted-accounts-list">
              <DeletedAccounts accounts={deleted} />
            </div>
          )}
        </>
      )}
      <AccountDialog
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((d) => ({ ...d, open }))}
        account={accountDialog.account}
        companyId={accountDialog.companyId}
      />
      <CompanyDialog
        open={companyDialog.open}
        onOpenChange={(open) => setCompanyDialog((d) => ({ ...d, open }))}
        company={companyDialog.company}
      />
    </div>
  );
}
