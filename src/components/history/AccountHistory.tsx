import { useTranslation } from "react-i18next";
import { HistoryList } from "@/components/history/HistoryList";
import { useCompanies } from "@/hooks/useCompanies";
import { useAccountHistory } from "@/hooks/useHistory";
import { useFormat } from "@/lib/format";
import { describeEvent } from "@/lib/history";
import { stageLabel } from "@/lib/stages";

/** The account's events, each with the company it was in. */
export function AccountHistory({ accountId }: { accountId: string }) {
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
      truncated={data?.truncated ?? false}
      isLoading={history.isLoading || companies.isLoading}
      isError={history.isError || companies.isError}
      onRetry={() => {
        if (history.isError) void history.refetch();
        if (companies.isError) void companies.refetch();
      }}
    />
  );
}
