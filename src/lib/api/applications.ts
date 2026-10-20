import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Application, Stage } from "@/types";
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
 * The trigger sets customer_id from the job and rejects a job and a candidate of different
 * customers. The value sent here is only there because the generated Insert type requires it;
 * the database never trusts it (CLAUDE.md, security rule 7).
 */
export async function linkCandidate(
  customerId: string,
  candidateId: string,
  jobIds: readonly string[],
): Promise<void> {
  if (jobIds.length === 0) return;
  const rows = jobIds.map((jobId) => ({
    customer_id: customerId,
    job_id: jobId,
    candidate_id: candidateId,
  }));
  const { error } = await supabase
    .from("applications")
    .upsert(rows, { onConflict: "job_id,candidate_id", ignoreDuplicates: true });
  if (error) throw fromDbError(error);
}

/** The position after the last card in a stage, so a moved card lands last in its column. */
async function nextPosition(customerId: string, stage: Stage): Promise<number> {
  const { data, error } = await supabase
    .from("applications")
    .select("position")
    .eq("customer_id", customerId)
    .eq("stage", stage)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.position ?? -1) + 1;
}

/** Moves a card to a stage, last in its column. The database sets stage_changed_at. */
export async function moveApplication(
  customerId: string,
  id: string,
  stage: Stage,
): Promise<Application> {
  const position = await nextPosition(customerId, stage);
  const { data, error } = await supabase
    .from("applications")
    .update({ stage, position })
    .eq("id", id)
    .eq("customer_id", customerId)
    .select(APPLICATION_COLUMNS)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("card_not_found");
  return parseApplicationRow(data);
}
