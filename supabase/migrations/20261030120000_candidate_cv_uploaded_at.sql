-- =============================================================================
-- When a candidate's current CV was uploaded (ATS-35, AC4)
--
-- A CV is replaced in place at a fixed path, so an AI assessment can't tell from the path
-- whether it was made from the CV the candidate has now. candidates.cv_uploaded_at answers
-- that: an assessment older than it was made from an earlier CV.
--
-- The database sets it, never the client (CLAUDE.md, security rule 7):
--   * Every upload writes cv_path, also when a new CV replaces the old one at the same path, so
--     a trigger on "update of cv_path" fires on each upload and stamps the time. A cleared
--     cv_path clears it.
--   * Any other update keeps the old value, so a client that sends cv_uploaded_at changes nothing.
--     The two triggers run in name order: keep first, then stamp when cv_path was written.
--
-- Existing CVs get the time their file was last written in Storage. Backfilled before the
-- triggers exist, so the keep trigger doesn't undo it.
--
-- Backwards compatible: a new nullable column that no code on main reads, and the triggers
-- change nothing the current app writes.
-- =============================================================================

alter table public.candidates add column if not exists cv_uploaded_at timestamptz;

update public.candidates c
set cv_uploaded_at = o.updated_at
from storage.objects o
where o.bucket_id = 'cvs' and o.name = c.cv_path and c.cv_uploaded_at is null;

create or replace function public.keep_candidate_cv_uploaded_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.cv_uploaded_at := old.cv_uploaded_at;
  return new;
end;
$$;

create or replace function public.stamp_candidate_cv_uploaded_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- clock_timestamp(), not now(): the time of this write, not of the transaction's start.
  new.cv_uploaded_at := case when new.cv_path is null then null else clock_timestamp() end;
  return new;
end;
$$;

drop trigger if exists candidates_cv_uploaded_at_1_keep on public.candidates;
create trigger candidates_cv_uploaded_at_1_keep
  before update on public.candidates
  for each row execute function public.keep_candidate_cv_uploaded_at();

drop trigger if exists candidates_cv_uploaded_at_2_stamp on public.candidates;
create trigger candidates_cv_uploaded_at_2_stamp
  before insert or update of cv_path on public.candidates
  for each row execute function public.stamp_candidate_cv_uploaded_at();
