// delete-candidate: deletes a candidate together with their CV file (ATS-56, AC1). Everything runs
// with the caller's JWT, so RLS and the storage policies decide; no service role is used.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { z } from "npm:zod@3.25.76/v4";

import { CV_BUCKET } from "../_shared/cvs.ts";
import { createHandler, type CandidateToDelete } from "./handler.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Supabase provides these to every Edge Function.
const supabaseUrl = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");

const noSession = { persistSession: false, autoRefreshToken: false };

/** Reads and writes as the caller, so RLS answers for the caller (security rule 2). */
function asCaller(authorization: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
}

async function getUserId(authorization: string): Promise<string | null> {
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await asCaller(authorization).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

const candidateRowSchema = z.object({ id: z.string(), customer_id: z.string() });

async function getCandidate(authorization: string, id: string): Promise<CandidateToDelete | null> {
  const { data, error } = await asCaller(authorization)
    .from("candidates")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = candidateRowSchema.parse(data);
  return { id: row.id, customerId: row.customer_id };
}

async function removeCv(authorization: string, path: string): Promise<void> {
  // Storage answers a path with no file with an empty list, not an error.
  const { error } = await asCaller(authorization).storage.from(CV_BUCKET).remove([path]);
  if (error) throw error;
}

async function deleteCandidate(
  authorization: string,
  candidate: CandidateToDelete,
): Promise<boolean> {
  const { data, error } = await asCaller(authorization)
    .from("candidates")
    .delete()
    .eq("id", candidate.id)
    .eq("customer_id", candidate.customerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function clearCvPath(authorization: string, candidate: CandidateToDelete): Promise<void> {
  const { error } = await asCaller(authorization)
    .from("candidates")
    .update({ cv_path: null })
    .eq("id", candidate.id)
    .eq("customer_id", candidate.customerId);
  if (error) throw error;
}

Deno.serve(createHandler({ getUserId, getCandidate, removeCv, deleteCandidate, clearCvPath }));
