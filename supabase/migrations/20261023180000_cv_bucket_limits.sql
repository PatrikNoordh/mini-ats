-- =============================================================================
-- CV uploads: limits on the cvs bucket, and replacing a CV (ATS-17)
--
-- The bucket and its read, insert and delete policies exist since the first migration. This adds:
--   * A server-side limit of 5 MB and PDF only, so a client that skips the form's checks is
--     still refused by Storage. MAX_CV_BYTES in src/lib/constants.ts is the same: change both.
--   * An update policy, so a new CV replaces the old one at the same path in one call (upsert).
--     The same rule as the other cvs policies: the customer's own folder while the account is
--     active (ATS-27), or an admin.
--
-- Backwards compatible: no code on main uploads to the bucket yet.
-- =============================================================================

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['application/pdf']
where id = 'cvs';

drop policy if exists "cvs_owner_or_admin_update" on storage.objects;
create policy "cvs_owner_or_admin_update" on storage.objects
  for update
  using (
    bucket_id = 'cvs'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
      or (select public.is_admin())
    )
  )
  with check (
    bucket_id = 'cvs'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.account_is_active()))
      or (select public.is_admin())
    )
  );
