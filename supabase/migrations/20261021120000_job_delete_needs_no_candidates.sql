-- =============================================================================
-- A job can only be deleted when no candidates are linked to it (ATS-26, AC1)
--
-- applications.job_id was `on delete cascade`, so deleting a job silently removed every card on
-- the board for it. The foreign key now refuses that with error 23503 (foreign_key_violation),
-- which the app shows as `job_has_candidates`. To empty a job, the user deletes its candidates
-- first; deleting a candidate still removes their applications (candidate_id stays cascade).
--
-- `no action` rather than `restrict`: both refuse a plain job delete, but `no action` checks at
-- the end of the statement. Deleting a whole account cascades from profiles to both jobs and
-- applications in one statement, and must keep working whatever order those cascades run in.
--
-- Backwards compatible: no code on main deletes jobs.
-- =============================================================================
alter table public.applications
  drop constraint applications_job_id_fkey,
  add constraint applications_job_id_fkey
    foreign key (job_id) references public.jobs (id) on delete no action;
