import type { Job } from "@/types";
import { AppError } from "@/lib/errors";
import { clone, db, delay, uid } from "./mockStore";

export type JobInput = Pick<Job, "title" | "description" | "location" | "status">;

export async function listJobs(customerId: string): Promise<Job[]> {
  await delay();
  return clone(db().jobs.filter((j) => j.customer_id === customerId));
}

export async function createJob(customerId: string, input: JobInput): Promise<Job> {
  await delay();
  const job: Job = {
    id: uid("job"),
    customer_id: customerId,
    created_at: new Date().toISOString(),
    ...input,
  };
  db().jobs.push(job);
  return clone(job);
}

export async function updateJob(
  customerId: string,
  id: string,
  patch: Partial<JobInput>,
): Promise<Job> {
  await delay();
  const job = db().jobs.find((j) => j.id === id && j.customer_id === customerId);
  if (!job) throw new AppError("job_not_found");
  Object.assign(job, patch);
  return clone(job);
}
