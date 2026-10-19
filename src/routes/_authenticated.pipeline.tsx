import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerGate } from "@/components/layout/CustomerGate";
import { EmptyState, ErrorState, PageHeader } from "@/components/States";
import { Board, type BoardCard } from "@/components/pipeline/Board";
import { CandidateSheet } from "@/components/pipeline/CandidateSheet";
import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { useApplications, useMoveApplication } from "@/hooks/useApplications";
import { useCandidates } from "@/hooks/useCandidates";
import { useJobs } from "@/hooks/useJobs";
import { resolveJobFilter } from "@/lib/stages";

const searchSchema = z.object({
  job: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Pipeline — Mini-ATS" },
      { name: "description", content: "Flytta kandidater mellan stegen i din rekrytering." },
      { property: "og:title", content: "Pipeline — Mini-ATS" },
      { property: "og:description", content: "Flytta kandidater mellan stegen i din rekrytering." },
    ],
  }),
  component: () => <CustomerGate>{(id) => <Pipeline customerId={id} />}</CustomerGate>,
});

function Pipeline({ customerId }: { customerId: string }) {
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
        candidateName: cands.data.find((c) => c.id === a.candidate_id)?.full_name ?? "Okänd",
        jobTitle: jobs.data.find((j) => j.id === a.job_id)?.title ?? "Okänt jobb",
      }))
      .filter((c) => !term || c.candidateName.toLowerCase().includes(term));
  }, [apps.data, cands.data, jobs.data, job, q]);

  const isLoading = apps.isLoading || cands.isLoading || jobs.isLoading;
  const isError = apps.isError || cands.isError || jobs.isError;
  const setSearch = (patch: { job?: string | undefined; q?: string | undefined }) =>
    navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div>
      <PageHeader
        title="Pipeline"
        meta={isLoading ? undefined : `${cards.length} kort`}
        action={<Button onClick={() => setCreating(true)}>+ Ny kandidat</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select
          value={job ?? "all"}
          onValueChange={(v) => setSearch({ job: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-9 sm:w-[220px]" aria-label="Filtrera på jobb">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla jobb</SelectItem>
            {jobs.data?.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.title}
                {j.status === "closed" ? " (stängt)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-9 sm:w-[280px]"
          placeholder="Sök kandidatnamn"
          value={q ?? ""}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
        />
      </div>

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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-[230px] shrink-0" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          title={job || q ? "Inga kort matchar filtret" : "Inga kandidater i pipelinen än"}
        >
          {job || q ? (
            <Button variant="link" onClick={() => setSearch({ job: undefined, q: undefined })}>
              Rensa filter
            </Button>
          ) : (
            "Lägg till en kandidat och koppla hen till ett jobb."
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
