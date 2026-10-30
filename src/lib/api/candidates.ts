import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Candidate } from "@/types";
import { cvPath, removeCvFile } from "@/lib/api/cvs";
import { AppError, fromWriteError } from "@/lib/errors";
import type { CandidateInput } from "@/lib/validation";

const CANDIDATE_COLUMNS =
  "id, customer_id, full_name, email, phone, linkedin_url, notes, cv_path, cv_uploaded_at, created_at";

const candidateRowSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  notes: z.string().nullable(),
  cv_path: z.string().nullable(),
  cv_uploaded_at: z.string().nullable(),
  created_at: z.string(),
});

/** A `candidates` row as the app's Candidate. Missing details become empty text. */
export function parseCandidateRow(row: unknown): Candidate {
  const c = candidateRowSchema.parse(row);
  return {
    ...c,
    email: c.email ?? "",
    phone: c.phone ?? "",
    linkedin_url: c.linkedin_url ?? "",
    notes: c.notes ?? "",
  };
}

/** The columns written from the candidate form. Empty optional details are stored as null. */
function toRow(input: CandidateInput) {
  return {
    full_name: input.full_name,
    email: input.email || null,
    phone: input.phone || null,
    linkedin_url: input.linkedin_url || null,
    notes: input.notes || null,
  };
}

/**
 * The customer's candidates, newest first. The filter on customer_id matters for admins: RLS
 * returns every customer's candidates to them.
 */
export async function listCandidates(customerId: string): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(parseCandidateRow);
}

/** Creates a candidate for the customer. An admin acting for the customer passes its id. */
export async function createCandidate(
  customerId: string,
  input: CandidateInput,
): Promise<Candidate> {
  const { data, error } = await supabase
    .from("candidates")
    .insert({ ...toRow(input), customer_id: customerId })
    .select(CANDIDATE_COLUMNS)
    .single();
  if (error) throw fromWriteError(error);
  return parseCandidateRow(data);
}

/**
 * Updates one of the customer's candidates. RLS hides other customers' candidates, so an update
 * that matches no row means the candidate does not exist for this customer.
 */
export async function updateCandidate(
  customerId: string,
  id: string,
  input: CandidateInput,
): Promise<Candidate> {
  const { data, error } = await supabase
    .from("candidates")
    .update(toRow(input))
    .eq("id", id)
    .eq("customer_id", customerId)
    .select(CANDIDATE_COLUMNS)
    .maybeSingle();
  if (error) throw fromWriteError(error);
  if (!data) throw new AppError("candidate_not_found");
  return parseCandidateRow(data);
}

/**
 * Points one of the customer's candidates at its CV, or at none with null. An update that
 * matches no row means the candidate does not exist for this customer.
 */
export async function setCandidateCvPath(
  customerId: string,
  id: string,
  cvPath: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("candidates")
    .update({ cv_path: cvPath })
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("candidate_not_found");
}

/**
 * Deletes one of the customer's candidates. Their applications (cards) and assessments go with
 * them through the database's cascades. The CV file goes first: if that fails nothing is
 * deleted, so a deleted candidate never leaves a CV behind (ATS-17). Its path is fixed, so the
 * file is removed even when this tab has not seen it uploaded; no file is no error.
 *
 * If the file is gone but the candidate can't be deleted, the candidate stays without a CV:
 * its cv_path is cleared, so it never points at the removed file (ATS-35). Clearing it is a
 * best effort; the delete's own error is the one the UI shows.
 */
export async function deleteCandidate(customerId: string, id: string): Promise<void> {
  await removeCvFile(cvPath(customerId, id));
  const { data, error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) {
    await setCandidateCvPath(customerId, id, null).catch(() => undefined);
    throw error;
  }
  if (!data) throw new AppError("candidate_not_found");
}
