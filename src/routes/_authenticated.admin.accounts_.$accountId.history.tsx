import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { RequireAdmin } from "@/components/auth/Guards";
import { HistoryList } from "@/components/history/HistoryList";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { useCompanies } from "@/hooks/useCompanies";
import { useAccountHistory } from "@/hooks/useHistory";
import { useProfiles } from "@/hooks/useProfiles";
import { useFormat } from "@/lib/format";
import { describeEvent } from "@/lib/history";
import { pageHead } from "@/lib/i18n";
import { stageLabel } from "@/lib/stages";

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
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
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
          />
          <p className="-mt-3 mb-4 text-sm text-muted-foreground">{t("history.accountHint")}</p>
          <div className="rounded-lg border bg-card p-4">
            <AccountEvents accountId={account.id} />
          </div>
        </>
      )}
    </div>
  );
}

/** The account's events, each with the company it was in. */
function AccountEvents({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const history = useAccountHistory(accountId);
  const companies = useCompanies();
  const data = history.data;
  const names = {
    job: (id: string) => data?.jobs.get(id),
    candidate: (id: string) => data?.candidates.get(id),
    stage: (id: string) => {
      const stage = data?.stages.get(id);
      return stage ? stageLabel(stage, t) : undefined;
    },
  };
  const items = (data?.events ?? []).map((event) => ({
    id: event.id,
    text: describeEvent(event, names, t, format.list),
    detail: companies.data?.find((c) => c.id === event.customer_id)?.name ?? "",
    at: event.created_at,
  }));
  return (
    <HistoryList
      items={items}
      isLoading={history.isLoading || companies.isLoading}
      isError={history.isError || companies.isError}
      onRetry={() => {
        if (history.isError) void history.refetch();
        if (companies.isError) void companies.refetch();
      }}
    />
  );
}
