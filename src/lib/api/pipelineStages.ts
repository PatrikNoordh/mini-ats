import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { PipelineStage } from "@/types";
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
