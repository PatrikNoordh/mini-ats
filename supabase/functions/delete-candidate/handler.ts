import { z } from "npm:zod@3.25.76/v4";

import { corsHeaders, json } from "../_shared/cors.ts";

export const requestSchema = z.object({ candidate_id: z.string().uuid() });

/** The candidate as the caller sees it through RLS. */
export interface CandidateToDelete {
  id: string;
  /** Read from the row, never from the request, so the CV path is the candidate's own. */
  customerId: string;
}

/**
 * The outside world, passed in so the flow can be tested without a project. Every step runs with
 * the caller's JWT, so RLS and the storage policies decide (CLAUDE.md, security rule 2). No step
 * uses the service role.
 */
export interface Deps {
  /** The caller's user id, or null for a missing, expired or invalid token. */
  getUserId: (authorization: string) => Promise<string | null>;
  getCandidate: (authorization: string, id: string) => Promise<CandidateToDelete | null>;
  /** Removes the CV file at the path. A file that is not there is no error. */
  removeCv: (authorization: string, path: string) => Promise<void>;
  /** Deletes the candidate row; false when no row was deleted. */
  deleteCandidate: (authorization: string, candidate: CandidateToDelete) => Promise<boolean>;
  /** Clears cv_path, so a candidate that could not be deleted never points at a removed file. */
  clearCvPath: (authorization: string, candidate: CandidateToDelete) => Promise<void>;
}

/** Where a candidate's CV lives, the same as cvPath() in src/lib/api/cvs.ts. */
export function cvPath(candidate: CandidateToDelete): string {
  return `${candidate.customerId}/${candidate.id}.pdf`;
}

/**
 * Deletes a candidate and their CV file in one call (ATS-56, AC1). Storage and the database cannot
 * share a transaction, so the order decides what a failure leaves:
 *
 *   1. The CV file is removed first. If that fails, nothing is deleted.
 *   2. Then the row, which takes the cards and assessments with it through the cascades.
 *   3. If the row delete fails, cv_path is cleared, so the candidate stays without a CV and can be
 *      deleted again. It never points at the removed file.
 *
 * So a deleted candidate never leaves a CV behind (ATS-17), and nobody is left holding an orphan
 * file nobody can see.
 */
export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);

    try {
      // The caller is checked before the body is even read.
      if (!(await deps.getUserId(authorization))) return json({ error: "not_authenticated" }, 401);

      const parsed = requestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
        ];
        return json({ error: "invalid_input", fields }, 400);
      }

      // RLS decides: another customer's candidate, or a deleted account's, is not found.
      const candidate = await deps.getCandidate(authorization, parsed.data.candidate_id);
      if (!candidate) return json({ error: "candidate_not_found" }, 404);

      await deps.removeCv(authorization, cvPath(candidate));

      let deleted: boolean;
      try {
        deleted = await deps.deleteCandidate(authorization, candidate);
      } catch (error) {
        await deps.clearCvPath(authorization, candidate).catch((clearError) => {
          console.error("delete-candidate: could not clear cv_path", clearError);
        });
        throw error;
      }
      // Deleted meanwhile, for example in another tab.
      if (!deleted) return json({ error: "candidate_not_found" }, 404);
      return json({ deleted: candidate.id }, 200);
    } catch (error) {
      // Logged for the Supabase function logs. Nothing about the candidate is logged.
      console.error("delete-candidate failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
