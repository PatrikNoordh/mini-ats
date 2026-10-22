export type Role = "admin" | "customer";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  company_name: string;
  email: string;
  created_at: string;
  /** Set when an admin deleted the account; it is deleted for good ACCOUNT_DELETE_GRACE_DAYS later. */
  deleted_at: string | null;
}

export type JobStatus = "open" | "closed";

export interface Job {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  location: string;
  status: JobStatus;
  created_at: string;
}

/** A job as listed on the jobs page, with the number of candidates linked to it. */
export interface JobWithCount extends Job {
  candidate_count: number;
}

export interface Candidate {
  id: string;
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  notes: string;
  created_at: string;
}

export type Stage = "new" | "screening" | "interview" | "offer" | "hired" | "rejected";

export interface Application {
  id: string;
  customer_id: string;
  job_id: string;
  candidate_id: string;
  stage: Stage;
  position: number;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}
