import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { PipelineStage, StageColour } from "@/types";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "@/lib/constants";
import { AppError, fromWriteError, toErrorCode } from "@/lib/errors";
import { defaultStageKeySchema, stageColourSchema, stageKindSchema } from "@/lib/stages";

const STAGE_COLUMNS = "id, customer_id, name, default_key, position, kind, colour";

const stageRowSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  name: z.string().nullable(),
  default_key: defaultStageKeySchema.nullable(),
  position: z.number(),
  kind: stageKindSchema,
  colour: stageColourSchema,
});

/** A `pipeline_stages` row as the app's PipelineStage. Throws on a value the app does not know. */
export function parseStageRow(row: unknown): PipelineStage {
  return stageRowSchema.parse(row);
}

/**
 * The customer's board columns, in board order. The filter on customer_id matters for admins: RLS
 * returns every customer's columns to them.
 */
export async function listStages(customerId: string): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select(STAGE_COLUMNS)
    .eq("customer_id", customerId)
    .order("position");
  if (error) throw error;
  return data.map(parseStageRow);
}

/**
 * The code for a refused column write: a column with cards is `stage_has_cards` (the foreign key
 * from the cards), a name another column has is `stage_name_taken`, a name over the limit is
 * `text_too_long`, and the kind and limit rules raise their own codes.
 */
export function stageWriteError(error: { code: string; message: string }): unknown {
  if (error.code === PG_FOREIGN_KEY_VIOLATION) return new AppError("stage_has_cards");
  if (error.code === PG_UNIQUE_VIOLATION) return new AppError("stage_name_taken");
  const code = toErrorCode(error.message);
  return code ? new AppError(code) : fromWriteError(error);
}

/**
 * Updates one of the customer's columns. An update that matches no row means the column is not
 * there for this customer.
 */
async function updateStage(
  customerId: string,
  id: string,
  patch: { name: string } | { colour: StageColour },
): Promise<void> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .update(patch)
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) throw stageWriteError(error);
  if (!data) throw new AppError("stage_not_found");
}

/** Gives a column a name of its own. Its kind never changes with it. */
export function renameStage(customerId: string, id: string, name: string): Promise<void> {
  return updateStage(customerId, id, { name });
}

/** Gives a column a colour from the palette. */
export function setStageColour(customerId: string, id: string, colour: StageColour): Promise<void> {
  return updateStage(customerId, id, { colour });
}

/**
 * Removes one of the customer's columns. The database refuses a column with cards, and the last
 * Hired, Rejected or open column, with codes the UI shows.
 */
export async function removeStage(customerId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .delete()
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) throw stageWriteError(error);
  if (!data) throw new AppError("stage_not_found");
}

/** Adds an open column just before the first Hired or Rejected one, in one database call. */
export async function addStage(
  customerId: string,
  name: string,
  colour: StageColour,
): Promise<PipelineStage> {
  const { data, error } = await supabase.rpc("add_stage", {
    customer_id: customerId,
    name,
    colour,
  });
  if (error) throw stageWriteError(error);
  return parseStageRow(data);
}

/**
 * Brings back the six default columns. Refused as `stage_has_cards`, changing nothing, while a
 * column it would remove still has cards. Returns the columns in board order.
 */
export async function resetStages(customerId: string): Promise<PipelineStage[]> {
  const { data, error } = await supabase.rpc("reset_stages", { customer_id: customerId });
  if (error) throw stageWriteError(error);
  return z.array(z.unknown()).parse(data).map(parseStageRow);
}

/**
 * Puts the customer's columns in the given order, in one database call under the customer's lock
 * (ATS-38). `stageIds` names each column once. Returns the columns in their new order.
 */
export async function reorderStages(
  customerId: string,
  stageIds: readonly string[],
): Promise<PipelineStage[]> {
  const { data, error } = await supabase.rpc("reorder_stages", {
    customer_id: customerId,
    stage_ids: [...stageIds],
  });
  if (error) throw stageWriteError(error);
  return z.array(z.unknown()).parse(data).map(parseStageRow);
}
