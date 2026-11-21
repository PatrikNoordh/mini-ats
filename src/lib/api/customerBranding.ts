import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { fromWriteError } from "@/lib/errors";
import type { BackgroundDim, CustomerBranding } from "@/types";

const BRANDING_COLUMNS =
  "customer_id, accent_colour, logo_path, background_path, background_dim, background_floor, surface_opacity, updated_at";

const brandingRowSchema = z.object({
  customer_id: z.string(),
  accent_colour: z.string().nullable(),
  logo_path: z.string().nullable(),
  background_path: z.string().nullable(),
  background_dim: z.enum(["light", "medium", "strong"]),
  background_floor: z.number().nullable(),
  surface_opacity: z.number().nullable(),
  updated_at: z.string(),
});

/**
 * The company's theme, or null when it has none (ATS-52). RLS returns the row to the company's
 * active members and to an admin, so null also means the caller may not see it.
 */
export async function getBranding(customerId: string): Promise<CustomerBranding | null> {
  const { data, error } = await supabase
    .from("customer_branding")
    .select(BRANDING_COLUMNS)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? brandingRowSchema.parse(data) : null;
}

/** What the settings page saves: the accent, the logo (ATS-54) and the background (ATS-55). */
export interface BrandingInput {
  accent_colour: string | null;
  logo_path: string | null;
  background_path: string | null;
  background_dim: BackgroundDim;
  background_floor: number | null;
  surface_opacity: number | null;
}

/**
 * Saves the company's theme in one upsert: a new row, or the existing one changed. RLS lets the
 * company's active members and an admin write it, and the database checks every value again.
 */
export async function saveBranding(customerId: string, input: BrandingInput): Promise<void> {
  const { error } = await supabase
    .from("customer_branding")
    .upsert({ customer_id: customerId, ...input }, { onConflict: "customer_id" });
  if (error) throw fromWriteError(error);
}

/** Removes the company's theme, so it sees the Mini-ATS theme again. */
export async function deleteBranding(customerId: string): Promise<void> {
  const { error } = await supabase.from("customer_branding").delete().eq("customer_id", customerId);
  if (error) throw fromWriteError(error);
}
