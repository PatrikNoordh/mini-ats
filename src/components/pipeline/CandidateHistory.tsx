import { useTranslation } from "react-i18next";
import { HistoryList } from "@/components/history/HistoryList";
import { useCandidateHistory } from "@/hooks/useHistory";
import { useFormat } from "@/lib/format";
import { actorLabel, describeEvent } from "@/lib/history";
import { stageLabel } from "@/lib/stages";
import type { Candidate, Job, PipelineStage } from "@/types";

/**
 * The candidate's history in the side panel (ATS-48 AC1): edits, job links and stage moves,
 * newest first, each with who made it. Jobs and columns are named from the board's own lists; one
 * removed since is shown as removed.
 */
export function CandidateHistory({
  customerId,
  candidate,
  jobs,
  stages,
}: {
  customerId: string;
  candidate: Candidate;
  jobs: readonly Job[];
  stages: readonly PipelineStage[];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const history = useCandidateHistory(customerId, candidate.id);
  const names = {
    job: (id: string) => jobs.find((j) => j.id === id)?.title,
    candidate: (id: string) => (id === candidate.id ? candidate.full_name : undefined),
    stage: (id: string) => {
      const stage = stages.find((s) => s.id === id);
      return stage ? stageLabel(stage, t) : undefined;
    },
  };
  const items = (history.data?.events ?? []).map((event) => ({
    id: event.id,
    text: describeEvent(event, names, t, format.list),
    detail: t("history.by", {
      actor: actorLabel(event.actor_id, history.data?.actors ?? new Map(), t),
    }),
    at: event.created_at,
  }));
  return (
    <HistoryList
      items={items}
      truncated={history.data?.truncated ?? false}
      isLoading={history.isLoading}
      isError={history.isError}
      onRetry={() => void history.refetch()}
    />
  );
}
