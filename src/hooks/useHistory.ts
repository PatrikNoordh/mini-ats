import { useQuery } from "@tanstack/react-query";
import { listAccountHistory, listAuditActors, listCandidateHistory } from "@/lib/api/auditEvents";
import { listCandidateNames } from "@/lib/api/candidates";
import { listJobTitles } from "@/lib/api/jobs";
import { listStagesByIds } from "@/lib/api/pipelineStages";
import { actorIds, referencedIds } from "@/lib/history";
import { queryKeys } from "@/lib/stages";
import type { AuditActor, AuditEvent, PipelineStage } from "@/types";

/** A candidate's events, newest first, and the names of the users who made them. */
export interface CandidateHistory {
  events: AuditEvent[];
  /** Whether there are older events than these. */
  truncated: boolean;
  actors: Map<string, AuditActor>;
}

/**
 * The history of one candidate (ATS-48 AC1). Loaded each time the history is opened, so a move
 * made on the board a moment ago is in it.
 */
export function useCandidateHistory(customerId: string, candidateId: string) {
  return useQuery({
    queryKey: queryKeys.candidateHistory(customerId, candidateId),
    queryFn: async (): Promise<CandidateHistory> => {
      const { events, truncated } = await listCandidateHistory(customerId, candidateId);
      const actors = await listAuditActors(actorIds(events));
      return { events, truncated, actors: new Map(actors.map((a) => [a.id, a])) };
    },
    refetchOnMount: "always",
  });
}

/** An account's events in every company, with the names of the jobs, candidates and columns. */
export interface AccountHistory {
  events: AuditEvent[];
  /** Whether there are older events than these. */
  truncated: boolean;
  jobs: Map<string, string>;
  candidates: Map<string, string>;
  stages: Map<string, PipelineStage>;
}

/** What one account did, in every company (ATS-48 AC2). Admin only. */
export function useAccountHistory(accountId: string) {
  return useQuery({
    queryKey: queryKeys.accountHistory(accountId),
    queryFn: async (): Promise<AccountHistory> => {
      const { events, truncated } = await listAccountHistory(accountId);
      const ids = referencedIds(events);
      const [jobs, candidates, stages] = await Promise.all([
        listJobTitles(ids.jobs),
        listCandidateNames(ids.candidates),
        listStagesByIds(ids.stages),
      ]);
      return {
        events,
        truncated,
        jobs,
        candidates,
        stages: new Map(stages.map((s) => [s.id, s])),
      };
    },
    refetchOnMount: "always",
  });
}
