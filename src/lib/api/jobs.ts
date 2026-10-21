import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Job, JobStatus, JobWithCount } from "@/types";
import { PG_FOREIGN_KEY_VIOLATION } from "@/lib/constants";
import { AppError, fromWriteError } from "@/lib/errors";
import { jobStatusSchema, type JobInput } from "@/lib/validation";

const JOB_COLUMNS = "id, customer_id, title, description, location, status, created_at";

const jobRowSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  status: jobStatusSchema,
  created_at: z.string(),
});

// `applications(count)` comes back as a list with one row: [{ count: n }].
const jobListRowSchema = jobRowSchema.extend({
  applications: z.array(z.object({ count: z.number() })),
});

/** A `jobs` row as the app's Job. Throws on a status the app does not know. */
export function parseJobRow(row: unknown): Job {
  const j = jobRowSchema.parse(row);
  return { ...j, description: j.description ?? "", location: j.location ?? "" };
}

/** A `jobs` row with its application count, as listed on the jobs page. */
export function parseJobListRow(row: unknown): JobWithCount {
  const { applications, ...job } = jobListRowSchema.parse(row);
  return { ...parseJobRow(job), candidate_count: applications[0]?.count ?? 0 };
}

/** The columns written from the job form. An empty description is stored as null. */
function toRow(input: JobInput) {
  return {
    title: input.title,
    location: input.location,
    description: input.description || null,
  };
}

/**
 * The customer's jobs, newest first, each with the number of linked candidates. The filter on
 * customer_id matters for admins: RLS returns every customer's jobs to them.
 */
export async function listJobs(customerId: string): Promise<JobWithCount[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(`${JOB_COLUMNS}, applications(count)`)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(parseJobListRow);
}

/** Creates an open job for the customer. An admin acting for the customer passes its id. */
export async function createJob(customerId: string, input: JobInput): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...toRow(input), customer_id: customerId })
    .select(JOB_COLUMNS)
    .single();
  if (error) throw fromWriteError(error);
  return parseJobRow(data);
}

/**
 * Updates one of the customer's jobs. RLS hides other customers' jobs, so an update that matches
 * no row means the job does not exist for this customer.
 */
async function patchJob(
  customerId: string,
  id: string,
  patch: ReturnType<typeof toRow> | { status: JobStatus },
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .eq("customer_id", customerId)
    .select(JOB_COLUMNS)
    .maybeSingle();
  if (error) throw fromWriteError(error);
  if (!data) throw new AppError("job_not_found");
  return parseJobRow(data);
}

export function updateJob(customerId: string, id: string, input: JobInput): Promise<Job> {
  return patchJob(customerId, id, toRow(input));
}

/** Closes or reopens a job. */
export function setJobStatus(customerId: string, id: string, status: JobStatus): Promise<Job> {
  return patchJob(customerId, id, { status });
}

/**
 * Deletes one of the customer's jobs. The database refuses while candidates are linked to it
 * (foreign key on applications.job_id), so no cards on the board disappear with the job.
 */
export async function deleteJob(customerId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("id")
    .maybeSingle();
  if (error) {
    throw error.code === PG_FOREIGN_KEY_VIOLATION ? new AppError("job_has_candidates") : error;
  }
  if (!data) throw new AppError("job_not_found");
}
