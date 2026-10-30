-- =============================================================================
-- A candidate's AI assessments go when their CV is removed (ATS-35, AC6)
--
-- An assessment summarises what the CV says. When the CV is removed, because it was the wrong
-- file or the candidate asked for it to be deleted, that summary must not stay behind. A CV that
-- is replaced keeps its assessments, marked as made from the previous CV (AC4), until the
-- recruiter assesses again.
--
-- cv_assessments is read-only for clients (CLAUDE.md, security rule 8), so the delete runs in a
-- security definer trigger. It fires only on the row the caller could update through RLS, and
-- deletes only that candidate's assessments.
--
-- Backwards compatible: the app removes a CV by setting cv_path to null, as it does today.
-- =============================================================================

create or replace function public.remove_assessments_with_cv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cv_assessments ca
  using public.applications a
  where ca.application_id = a.id and a.candidate_id = new.id;
  return new;
end;
$$;

drop trigger if exists candidates_remove_assessments_with_cv on public.candidates;
create trigger candidates_remove_assessments_with_cv
  after update of cv_path on public.candidates
  for each row
  when (old.cv_path is not null and new.cv_path is null)
  execute function public.remove_assessments_with_cv();
