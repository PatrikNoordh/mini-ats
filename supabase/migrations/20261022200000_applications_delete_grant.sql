-- =============================================================================
-- A candidate's job link can be removed (ATS-30)
--
-- The candidate dialog lets a recruiter untick a job the candidate is linked to. That deletes
-- the application (the card on the board), and its CV assessment goes with it through the
-- existing foreign key cascade.
--
-- ATS-22 left applications delete out of the grants, since only the cascade from a deleted
-- candidate removed cards then. The existing policy applications_owner_or_admin (for all) decides
-- whose rows: a customer its own, while its account is active (ATS-27), and an admin any.
--
-- Backwards compatible: the code on main never deletes an application.
-- =============================================================================

grant delete on public.applications to authenticated;
