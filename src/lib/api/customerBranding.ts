import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { CustomerBranding } from "@/types";

const BRANDING_COLUMNS =
  "customer_id, accent_colour, logo_path, background_path, background_dim, updated_at";

const brandingRowSchema = z.object({
  customer_id: z.string(),
  accent_colour: z.string().nullable(),
  logo_path: z.string().nullable(),
  background_path: z.string().nullable(),
  background_dim: z.enum(["light", "medium", "strong"]),
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
