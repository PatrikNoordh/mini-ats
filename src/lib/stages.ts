import type { TFunction } from "i18next";
import { z } from "zod";

import type { Application, Job, PipelineStage, StageColour, StageKind } from "@/types";
import { MS_PER_DAY } from "./constants";

/** The keys of the six default stages, in their default order (ATS-38). */
export const defaultStageKeySchema = z.enum([
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
]);

export const DEFAULT_STAGE_KEYS = defaultStageKeySchema.options;

export const stageKindSchema = z.enum(["open", "hired", "rejected"]);

/** The same list as the check on `pipeline_stages.colour`. */
export const stageColourSchema = z.enum([
  "grey",
  "blue",
  "teal",
  "violet",
  "pink",
  "amber",
  "green",
  "red",
]);

/** The dot class for each palette colour: the `--stage-<colour>` tokens in src/styles.css. */
export const STAGE_DOT_CLASS: Record<StageColour, string> = {
  grey: "bg-stage-grey",
  blue: "bg-stage-blue",
  teal: "bg-stage-teal",
  violet: "bg-stage-violet",
  pink: "bg-stage-pink",
  amber: "bg-stage-amber",
  green: "bg-stage-green",
  red: "bg-stage-red",
};

/**
 * A stage's name on screen: the name the customer typed, shown as it is, or the translated name of
 * a default stage that was never renamed.
 */
export function stageLabel(
  stage: Pick<PipelineStage, "name" | "default_key">,
  t: TFunction,
): string {
  if (stage.name !== null) return stage.name;
  return stage.default_key ? t(`stages.${stage.default_key}`) : "";
}

/**
 * The id of the stage next to a stage on the board, one step left (-1) or right (1). None past
 * the ends. `stages` is in board order.
 */
export function neighbourStageId(
  stages: readonly Pick<PipelineStage, "id">[],
  stageId: string,
  step: -1 | 1,
): string | undefined {
  const index = stages.findIndex((s) => s.id === stageId);
  return index === -1 ? undefined : stages[index + step]?.id;
}

/**
 * The columns in a new order, before the database answers: in the order of `stageIds`, with
 * positions 0 to n - 1. A column not named keeps its place at the end, so a list out of date
 * never drops one from the board.
 */
export function withStagesOrdered<S extends PipelineStage>(
  stages: readonly S[],
  stageIds: readonly string[],
): S[] {
  const rank = new Map(stageIds.map((id, index) => [id, index]));
  return [...stages]
    .sort((a, b) => (rank.get(a.id) ?? stageIds.length) - (rank.get(b.id) ?? stageIds.length))
    .map((stage, position) => ({ ...stage, position }));
}

/** The first stage of a kind in board order, for example where rejected cards go (ATS-31). */
export function firstStageOfKind<S extends Pick<PipelineStage, "kind">>(
  stages: readonly S[],
  kind: StageKind,
): S | undefined {
  return stages.find((s) => s.kind === kind);
}

/** Whole days since the given ISO date (never negative). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

/**
 * Same rule as the `candidates.linkedin_url` check in the database
 * (`~* '^https?://([a-z]+\.)?linkedin\.com/'`), so the form never accepts
 * a URL that the database would reject.
 */
const LINKEDIN_URL_PATTERN = /^https?:\/\/([a-z]+\.)?linkedin\.com\//i;

export function isLinkedInUrl(value: string): boolean {
  return LINKEDIN_URL_PATTERN.test(value);
}

/**
 * The `?job=` filter only applies to a job of the active customer. After a
 * customer switch it points at the previous customer's job, so it is dropped.
 * While the jobs are still loading the filter is kept as it is.
 */
export function resolveJobFilter(
  job: string | undefined,
  jobs: readonly Pick<Job, "id">[] | undefined,
): string | undefined {
  if (!job || !jobs) return job;
  return jobs.some((j) => j.id === job) ? job : undefined;
}

/** The open jobs a candidate can still be added to: every open job they are not linked to. */
export function jobsToAdd<J extends Pick<Job, "id" | "status">>(
  jobs: readonly J[],
  applications: readonly Pick<Application, "job_id" | "candidate_id">[],
  candidateId: string,
): J[] {
  const linked = new Set(
    applications.filter((a) => a.candidate_id === candidateId).map((a) => a.job_id),
  );
  return jobs.filter((j) => j.status === "open" && !linked.has(j.id));
}

/** How many cards each column has, by stage id: every card of the customer, not a filtered few. */
export function cardCountsByStage(
  applications: readonly Pick<Application, "stage_id">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of applications) counts.set(a.stage_id, (counts.get(a.stage_id) ?? 0) + 1);
  return counts;
}

/** Why a column cannot be removed, as the error code the database would answer, or null. */
export type StageRemoveBlock =
  "stage_has_cards" | "stage_hired_required" | "stage_rejected_required" | "stage_open_required";

/**
 * Why a column cannot be removed right now: it has cards, or it is the last column of its kind
 * (one Hired, at least one Rejected and one open column, ATS-38 and ATS-40). The database refuses
 * the same; this lets the menu say why before anything is sent.
 */
export function stageRemoveBlock(
  stage: Pick<PipelineStage, "id" | "kind">,
  stages: readonly Pick<PipelineStage, "kind">[],
  cardCounts: ReadonlyMap<string, number>,
): StageRemoveBlock | null {
  if ((cardCounts.get(stage.id) ?? 0) > 0) return "stage_has_cards";
  if (stages.filter((s) => s.kind === stage.kind).length > 1) return null;
  if (stage.kind === "hired") return "stage_hired_required";
  return stage.kind === "rejected" ? "stage_rejected_required" : "stage_open_required";
}

/**
 * The columns that stop a reset: a reset removes every column that is not a default, so it is
 * refused while one of them has cards. Empty when the board can be reset.
 */
export function resetBlockers<S extends Pick<PipelineStage, "id" | "default_key">>(
  stages: readonly S[],
  cardCounts: ReadonlyMap<string, number>,
): S[] {
  return stages.filter((s) => s.default_key === null && (cardCounts.get(s.id) ?? 0) > 0);
}

/** The first palette colour no column uses yet, for a new column; grey once all are taken. */
export function unusedColour(stages: readonly Pick<PipelineStage, "colour">[]): StageColour {
  const used = new Set(stages.map((s) => s.colour));
  return stageColourSchema.options.find((c) => !used.has(c)) ?? "grey";
}

/**
 * The board after a card is moved, before the database answers: the card is in its new stage,
 * last in the column, and its days in stage start again.
 */
export function withCardMoved(
  applications: readonly Application[],
  id: string,
  stageId: string,
  now: Date = new Date(),
): Application[] {
  const iso = now.toISOString();
  return applications.map((a) =>
    a.id === id
      ? {
          ...a,
          stage_id: stageId,
          position: Number.MAX_SAFE_INTEGER,
          stage_changed_at: iso,
          updated_at: iso,
        }
      : a,
  );
}

/**
 * The board with one card put back as it was. Only that card changes, so a failed move never
 * undoes another move made after it.
 */
export function withCardRestored(
  applications: readonly Application[],
  card: Application,
): Application[] {
  return applications.map((a) => (a.id === card.id ? card : a));
}

/**
 * The candidate's other cards that are still open, meaning in a stage of kind `open`, after
 * `hired` was moved to the Hired stage (ATS-31). The prompt offers to move these to Rejected.
 */
export function otherOpenApplications<
  A extends Pick<Application, "id" | "candidate_id" | "stage_id">,
>(
  applications: readonly A[],
  hired: Pick<Application, "id" | "candidate_id">,
  stages: readonly Pick<PipelineStage, "id" | "kind">[],
): A[] {
  const open = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id));
  return applications.filter(
    (a) => a.candidate_id === hired.candidate_id && a.id !== hired.id && open.has(a.stage_id),
  );
}

export const queryKeys = {
  profiles: () => ["profiles"] as const,
  /** Every customer's open-job count. Admin only, so it holds no single customer's id. */
  openJobCounts: () => ["openJobCounts"] as const,
  jobs: (customerId: string | null) => ["jobs", customerId] as const,
  candidates: (customerId: string | null) => ["candidates", customerId] as const,
  applications: (customerId: string | null) => ["applications", customerId] as const,
  /** The customer's board columns, in board order (ATS-39). */
  stages: (customerId: string | null) => ["stages", customerId] as const,
  /** Every assessment list of the customer, to refresh them all after a new assessment. */
  assessmentsAll: (customerId: string | null) => ["assessments", customerId] as const,
  /** The assessments of one candidate's applications (ATS-19). */
  assessments: (customerId: string | null, candidateId: string | null) =>
    ["assessments", customerId, candidateId] as const,
  /** Every CV link of the customer, to refresh them all after a change. */
  cvUrls: (customerId: string | null) => ["cvUrl", customerId] as const,
  /** A short-lived link to open one CV (ATS-17). */
  cvUrl: (customerId: string | null, path: string | null) => ["cvUrl", customerId, path] as const,
};
