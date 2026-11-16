import type { TFunction } from "i18next";
import type { AuditActor, AuditEvent } from "@/types";

/**
 * Names for the ids an event holds. The log stores no names (ATS-47), so a history looks them up
 * in what the reader can see now. A deleted row has no name and is shown as removed.
 */
export interface HistoryNames {
  job: (id: string) => string | undefined;
  candidate: (id: string) => string | undefined;
  stage: (id: string) => string | undefined;
}

/** The fields an update can name, in the order the log writes them. Others are not shown. */
const FIELD_KEYS = [
  "full_name",
  "email",
  "phone",
  "linkedin_url",
  "notes",
  "cv_path",
  "title",
  "description",
  "location",
  "status",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

function isFieldKey(field: string): field is FieldKey {
  return FIELD_KEYS.some((key) => key === field);
}

/** The changed fields as words in the active language: "e-post och anteckningar". */
function fieldList(
  fields: readonly string[] | null,
  t: TFunction,
  list: (items: readonly string[]) => string,
): string {
  return list((fields ?? []).filter(isFieldKey).map((field) => t(`history.fields.${field}`)));
}

/** A value the event keeps, or undefined. */
function value(values: AuditEvent["before"], key: string): string | undefined {
  return values?.[key] ?? undefined;
}

/**
 * One event as a sentence: "Flyttade Anna Berg från Screening till Intervju i Snickare". Ids are
 * named through `names`; a job event names its job from the title it keeps.
 */
export function describeEvent(
  event: AuditEvent,
  names: HistoryNames,
  t: TFunction,
  list: (items: readonly string[]) => string,
): string {
  const kept = event.after ?? event.before;
  // A delete of a candidate, or of its card with it, happens as the candidate goes, so "a removed
  // candidate" would say it twice: "Tog bort en borttagen kandidat". It is just "a candidate" then.
  const removed = {
    candidate: t(event.action === "delete" ? "history.someCandidate" : "history.removedCandidate"),
    job: t("history.removedJob"),
    stage: t("history.removedStage"),
  };
  const nameOf = (kind: keyof HistoryNames, id: string | undefined) =>
    (id && names[kind](id)) || removed[kind];

  switch (event.table_name) {
    case "jobs": {
      const job = value(kept, "title") ?? removed.job;
      if (event.action !== "update") return t(`history.job.${event.action}`, { job });
      if (event.fields?.length === 1 && event.fields[0] === "status") {
        return t(
          value(event.after, "status") === "closed" ? "history.job.close" : "history.job.reopen",
          {
            job,
          },
        );
      }
      return t("history.job.update", { job, fields: fieldList(event.fields, t, list) });
    }
    case "candidates": {
      const candidate = nameOf("candidate", event.row_id);
      if (event.action !== "update") return t(`history.candidate.${event.action}`, { candidate });
      return t("history.candidate.update", { candidate, fields: fieldList(event.fields, t, list) });
    }
    case "applications": {
      const candidate = nameOf("candidate", value(kept, "candidate_id"));
      const job = nameOf("job", value(kept, "job_id"));
      if (event.action !== "update") return t(`history.card.${event.action}`, { candidate, job });
      if (event.fields?.length === 1 && event.fields[0] === "stage_id") {
        return t("history.card.move", {
          candidate,
          job,
          from: nameOf("stage", value(event.before, "stage_id")),
          to: nameOf("stage", value(event.after, "stage_id")),
        });
      }
      return t("history.card.update", { candidate, job });
    }
  }
}

/**
 * Who made the change, as the reader may see it: a name, "Admin" for an admin a customer may not
 * name, the system when no user did, and a removed user for one that is purged.
 */
export function actorLabel(
  actorId: string | null,
  actors: ReadonlyMap<string, AuditActor>,
  t: TFunction,
): string {
  if (actorId === null) return t("history.system");
  const actor = actors.get(actorId);
  if (!actor) return t("history.removedUser");
  if (actor.full_name) return actor.full_name;
  return actor.is_admin ? t("roles.admin") : t("history.unnamedUser");
}

/** The distinct actors of the events, to look up their names in one request. */
export function actorIds(events: readonly AuditEvent[]): string[] {
  return [...new Set(events.flatMap((e) => (e.actor_id ? [e.actor_id] : [])))];
}

/** The ids of the jobs, candidates and columns the events name, for a history across companies. */
export function referencedIds(events: readonly AuditEvent[]): {
  jobs: string[];
  candidates: string[];
  stages: string[];
} {
  const jobs = new Set<string>();
  const candidates = new Set<string>();
  const stages = new Set<string>();
  for (const e of events) {
    if (e.candidate_id) candidates.add(e.candidate_id);
    for (const values of [e.before, e.after]) {
      const job = value(values, "job_id");
      const stage = value(values, "stage_id");
      if (e.table_name === "applications" && job) jobs.add(job);
      if (e.table_name === "applications" && stage) stages.add(stage);
    }
  }
  return { jobs: [...jobs], candidates: [...candidates], stages: [...stages] };
}
