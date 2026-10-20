import type { Application, Candidate } from "@/types";
import { AppError } from "@/lib/errors";
import { clone, db, delay, uid } from "./mockStore";

export type CandidateInput = Pick<
  Candidate,
  "full_name" | "email" | "phone" | "linkedin_url" | "notes"
>;

export async function listCandidates(customerId: string): Promise<Candidate[]> {
  await delay();
  return clone(db().candidates.filter((c) => c.customer_id === customerId));
}

/**
 * Adds the missing job links. Existing links are never removed here. The job ids come from the
 * customer's jobs in Supabase (since ATS-9), so they are not checked against the mock jobs.
 */
function addLinks(customerId: string, candidateId: string, jobIds: string[]) {
  const s = db();
  const wanted = new Set(jobIds);
  const existing = new Set(
    s.applications.filter((a) => a.candidate_id === candidateId).map((a) => a.job_id),
  );
  const now = new Date().toISOString();
  for (const jobId of wanted) {
    if (existing.has(jobId)) continue;
    const maxPos = Math.max(
      -1,
      ...s.applications
        .filter((a) => a.customer_id === customerId && a.stage === "new")
        .map((a) => a.position),
    );
    const app: Application = {
      id: uid("app"),
      customer_id: customerId,
      job_id: jobId,
      candidate_id: candidateId,
      stage: "new",
      position: maxPos + 1,
      stage_changed_at: now,
      created_at: now,
      updated_at: now,
    };
    s.applications.push(app);
  }
}

export async function createCandidate(
  customerId: string,
  input: CandidateInput,
  jobIds: string[],
): Promise<Candidate> {
  await delay();
  const cand: Candidate = {
    id: uid("cand"),
    customer_id: customerId,
    created_at: new Date().toISOString(),
    ...input,
  };
  db().candidates.push(cand);
  addLinks(customerId, cand.id, jobIds);
  return clone(cand);
}

export async function updateCandidate(
  customerId: string,
  id: string,
  input: CandidateInput,
  jobIds: string[],
): Promise<Candidate> {
  await delay();
  const cand = db().candidates.find((c) => c.id === id && c.customer_id === customerId);
  if (!cand) throw new AppError("candidate_not_found");
  Object.assign(cand, input);
  addLinks(customerId, id, jobIds);
  return clone(cand);
}
