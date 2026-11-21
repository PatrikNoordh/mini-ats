import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { RequireAdmin } from "@/components/auth/Guards";
import { AccountHistory } from "@/components/history/AccountHistory";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { useProfiles } from "@/hooks/useProfiles";
import { pageHead } from "@/lib/i18n";

const paramsSchema = z.object({ accountId: z.string().uuid() });

export const Route = createFileRoute("/_authenticated/admin/accounts_/$accountId/history")({
  params: { parse: (p) => paramsSchema.parse(p) },
  head: ({ match }) => pageHead(match.context.language, "history"),
  component: () => (
    <RequireAdmin>
      <AccountHistoryPage />
    </RequireAdmin>
  ),
});

/** What one account did, in every company, newest first (ATS-48 AC2). Admin only. */
function AccountHistoryPage() {
  const { accountId } = Route.useParams();
  const { t } = useTranslation();
  const profiles = useProfiles();
  const account = profiles.data?.find((p) => p.id === accountId);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="solid-on-image mb-3 -ml-2">
        <Link to="/admin/accounts">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("history.back")}
        </Link>
      </Button>
      {profiles.isLoading ? (
        <div className="rounded-lg border bg-card">
          <LoadingRows rows={3} />
        </div>
      ) : profiles.isError ? (
        <div className="rounded-lg border bg-card p-4">
          <ErrorState onRetry={() => void profiles.refetch()} />
        </div>
      ) : !account ? (
        <EmptyState title={t("history.accountNotFound")} />
      ) : (
        <>
          <PageHeader
            title={t("history.accountTitle", { name: account.full_name || account.email })}
            hint={t("history.accountHint")}
          />
          <div className="rounded-lg border bg-card p-4">
            <AccountHistory accountId={account.id} />
          </div>
        </>
      )}
    </div>
  );
}
