import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerGate } from "@/components/layout/CustomerGate";
import { EmptyState, ErrorState, PageHeader } from "@/components/States";
import { Board, type BoardCard } from "@/components/pipeline/Board";
import { BoardFilters, type BoardFilterValues } from "@/components/pipeline/BoardFilters";
import { CandidateSheet } from "@/components/pipeline/CandidateSheet";
import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { useApplications, useMoveApplication } from "@/hooks/useApplications";
import { useCandidates } from "@/hooks/useCandidates";
import { useJobs } from "@/hooks/useJobs";
import { MAX_SEARCH_LENGTH } from "@/lib/constants";
import { pageHead } from "@/lib/i18n";
import { resolveJobFilter, STAGES } from "@/lib/stages";

const searchSchema = z.object({
  job: z.string().optional().catch(undefined),
  // The router reads a hand-typed ?q=123 as a number. Keep it as the text that was typed.
  q: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).slice(0, MAX_SEARCH_LENGTH))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => pageHead(match.context.language, "pipeline"),
  component: () => <CustomerGate>{(id) => <Pipeline customerId={id} />}</CustomerGate>,
});

function Pipeline({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const apps = useApplications(customerId);
  const cands = useCandidates(customerId);
  const jobs = useJobs(customerId);
  const move = useMoveApplication(customerId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { q } = search;
  const job = resolveJobFilter(search.job, jobs.data);

  // Switching customer leaves the previous customer's job in the URL: clear it.
  useEffect(() => {
    if (search.job && !job) {
      navigate({ to: ".", search: (prev) => ({ ...prev, job: undefined }), replace: true });
    }
  }, [search.job, job, navigate]);

  const cards = useMemo<BoardCard[]>(() => {
    if (!apps.data || !cands.data || !jobs.data) return [];
    const term = (q ?? "").trim().toLowerCase();
    return apps.data
      .filter((a) => !job || a.job_id === job)
      .map((a) => ({
        app: a,
        candidateName:
          cands.data.find((c) => c.id === a.candidate_id)?.full_name ??
          t("pipeline.unknownCandidate"),
        jobTitle: jobs.data.find((j) => j.id === a.job_id)?.title ?? t("pipeline.unknownJob"),
      }))
      .filter((c) => !term || c.candidateName.toLowerCase().includes(term));
  }, [apps.data, cands.data, jobs.data, job, q, t]);

  const isLoading = apps.isLoading || cands.isLoading || jobs.isLoading;
  const isError = apps.isError || cands.isError || jobs.isError;
  const setSearch = (patch: BoardFilterValues) =>
    navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div>
      <PageHeader
        title={t("pipeline.title")}
        meta={isLoading ? undefined : t("pipeline.cardCount", { count: cards.length })}
        action={<Button onClick={() => setCreating(true)}>{t("pipeline.newCandidate")}</Button>}
      />
      <BoardFilters jobs={jobs.data} job={job} q={q} onChange={setSearch} />

      {isError ? (
        <ErrorState
          onRetry={() => {
            apps.refetch();
            cands.refetch();
            jobs.refetch();
          }}
        />
      ) : isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {STAGES.map((stage) => (
            <Skeleton key={stage} className="h-80 w-kanban-column shrink-0" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState title={job || q ? t("pipeline.noMatch") : t("pipeline.empty")}>
          {job || q ? (
            <Button variant="link" onClick={() => setSearch({ job: undefined, q: undefined })}>
              {t("pipeline.clearFilters")}
            </Button>
          ) : (
            t("pipeline.emptyHint")
          )}
        </EmptyState>
      ) : (
        <Board
          cards={cards}
          onMove={(id, stage) => move.mutate({ id, stage })}
          onOpen={(c) => setOpenId(c.app.candidate_id)}
        />
      )}

      <CandidateSheet
        customerId={customerId}
        candidate={cands.data?.find((c) => c.id === openId) ?? null}
        applications={apps.data ?? []}
        jobs={jobs.data ?? []}
        onClose={() => setOpenId(null)}
      />
      <CandidateDialog
        customerId={customerId}
        open={creating}
        onOpenChange={setCreating}
        candidate={null}
      />
    </div>
  );
}
