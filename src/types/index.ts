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
  /** Where the CV is in the cvs bucket, or null when the candidate has none (ATS-17). */
  cv_path: string | null;
  /** When the current CV was uploaded, set by the database, or null without a CV (ATS-35). */
  cv_uploaded_at: string | null;
  created_at: string;
}

/**
 * An AI assessment of a candidate's CV against the job of one application (ATS-18). A suggestion
 * for the recruiter, never a decision. Written only by the assess-cv Edge Function.
 */
export interface CvAssessment {
  id: string;
  application_id: string;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  created_at: string;
}

/** The key of one of the six default stages. The app translates it as `stages.<key>`. */
export type DefaultStageKey = "new" | "screening" | "interview" | "offer" | "hired" | "rejected";

/** What a stage means: an open step, the one Hired stage, or a Rejected stage (ATS-38). */
export type StageKind = "open" | "hired" | "rejected";

/** A colour from the fixed stage palette, the same list as the check on `pipeline_stages.colour`. */
export type StageColour = "grey" | "blue" | "teal" | "violet" | "pink" | "amber" | "green" | "red";

/** One column of a customer's board (ATS-38). */
export interface PipelineStage {
  id: string;
  customer_id: string;
  /** The name the customer gave it, or null for a default that keeps its translated name. */
  name: string | null;
  default_key: DefaultStageKey | null;
  position: number;
  kind: StageKind;
  colour: StageColour;
}

export interface Application {
  id: string;
  customer_id: string;
  job_id: string;
  candidate_id: string;
  stage_id: string;
  position: number;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}
