-- =============================================================================
-- A recruiter can remove an AI assessment without removing the CV (ATS-56, AC3)
--
-- An assessment is a suggestion. A recruiter who finds it wrong or no longer useful can remove
-- it and keep the CV. Clients still never create or change an assessment: only assess-cv
-- creates them, with the service role (CLAUDE.md, security rule 8, now "clients may read and
-- delete their own assessments; only assess-cv creates them").
--
-- The delete goes through RLS like every other table, with the same rule as reading: the
-- customer's own assessments while its account is active, and any for an admin. No security
-- definer function and no service role.
--
-- Backwards compatible: the code on main and v1.0-submission never delete an assessment.
-- =============================================================================

drop policy if exists "cv_assessments_delete" on public.cv_assessments;
create policy "cv_assessments_delete" on public.cv_assessments
  for delete using (
    (customer_id = (select auth.uid()) and (select public.account_is_active())) or (select public.is_admin())
  );

grant delete on public.cv_assessments to authenticated;
