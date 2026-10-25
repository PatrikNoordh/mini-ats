import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Application, Stage } from "@/types";
import { PG_UNIQUE_VIOLATION } from "@/lib/constants";
import { AppError, fromDbError } from "@/lib/errors";
import { stageSchema } from "@/lib/stages";

const APPLICATION_COLUMNS =
  "id, customer_id, job_id, candidate_id, stage, position, stage_changed_at, created_at, updated_at";

const applicationRowSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  job_id: z.string(),
  candidate_id: z.string(),
  stage: stageSchema,
  position: z.number(),
  stage_changed_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** An `applications` row as the app's Application. Throws on a stage the app does not know. */
export function parseApplicationRow(row: unknown): Application {
  return applicationRowSchema.parse(row);
}

/**
 * The customer's applications, in board order. The filter on customer_id matters for admins: RLS
 * returns every customer's applications to them.
 */
export async function listApplications(customerId: string): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("customer_id", customerId)
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data.map(parseApplicationRow);
}

/**
 * Links a candidate to jobs. New links start in the `new` stage (the column default). A link that
 * already exists is skipped, so a retry or a second tab never fails on the unique constraint.
 *
 * customer_id is not sent: the trigger sets it from the job and rejects a job and a candidate of
 * different customers (CLAUDE.md, security rule 7).
 */
export async function linkCandidate(candidateId: string, jobIds: readonly string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const rows = jobIds.map((jobId) => ({ job_id: jobId, candidate_id: candidateId }));
  const { error } = await supabase
    .from("applications")
    .upsert(rows, { onConflict: "job_id,candidate_id", ignoreDuplicates: true });
  if (error) throw fromDbError(error);
}

/**
 * Removes a candidate's links to jobs: their cards leave the board, and each card's assessment goes
 * with it (foreign key cascade). A link already removed, for example in another tab, is no error.
 * The filter on customer_id matters for admins, whom RLS lets delete any customer's rows.
 */
export async function unlinkCandidate(
  customerId: string,
  candidateId: string,
  jobIds: readonly string[],
): Promise<void> {
  if (jobIds.length === 0) return;
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("customer_id", customerId)
    .eq("candidate_id", candidateId)
    .in("job_id", jobIds);
  if (error) throw fromDbError(error);
}

/** A failed link of one candidate to one job. A link that already exists is `already_linked`. */
export function addApplicationError(error: Error & { code: string }): Error {
  return error.code === PG_UNIQUE_VIOLATION ? new AppError("already_linked") : fromDbError(error);
}

/**
 * Adds a candidate to one more job, in the `new` stage. Unlike linkCandidate, a link that already
 * exists fails with `already_linked`, so the user is told instead of nothing happening.
 * customer_id is set by the trigger from the job (CLAUDE.md, security rule 7).
 */
export async function addApplication(candidateId: string, jobId: string): Promise<Application> {
  const { data, error } = await supabase
    .from("applications")
    .insert({ job_id: jobId, candidate_id: candidateId })
    .select(APPLICATION_COLUMNS)
    .single();
  if (error) throw addApplicationError(error);
  return parseApplicationRow(data);
}

/**
 * Moves a card to a stage, last in its column. One database call sets the stage and the position,
 * so two quick moves into the same column never share a position. The database sets
 * stage_changed_at, and raises card_not_found when the card is not this customer's.
 */
export async function moveApplication(
  customerId: string,
  id: string,
  stage: Stage,
): Promise<Application> {
  const { data, error } = await supabase.rpc("move_application", {
    application_id: id,
    customer_id: customerId,
    new_stage: stage,
  });
  if (error) throw fromDbError(error);
  return parseApplicationRow(data);
}

/** How moving several cards to Rejected went. The ones that moved stay moved. */
export interface RejectResult {
  moved: number;
  failed: number;
}

/**
 * Moves the given cards to Rejected, one at a time through move_application, so each gets its
 * position and stage_changed_at from the database like any other move (ATS-31). One failing card
 * never stops the others; the result says how many failed.
 */
export async function rejectApplications(
  customerId: string,
  ids: readonly string[],
): Promise<RejectResult> {
  let moved = 0;
  for (const id of ids) {
    try {
      await moveApplication(customerId, id, "rejected");
      moved++;
    } catch {
      // Counted below; the board refetches and shows the true state.
    }
  }
  return { moved, failed: ids.length - moved };
}
