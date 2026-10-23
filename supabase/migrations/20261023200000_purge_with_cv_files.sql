-- =============================================================================
-- The daily purge also removes the deleted accounts' CV files (ATS-17, AC7)
--
-- purge_deleted_accounts() deleted the Auth users in SQL, and the cascades removed their data,
-- but not their files in Storage. SQL cannot remove those: deleting a storage.objects row leaves
-- the file itself in the bucket. Only the Storage API removes it.
--
-- So the purge moves to the purge-deleted-accounts Edge Function. Each night pg_cron calls it
-- through pg_net; it removes each account's CV folder, then deletes the Auth user. The 30-day
-- rule stays here, in accounts_due_for_purge(), which only the service role may execute.
--
-- The call reads three Vault secrets, set once per project in the SQL Editor and never in the
-- repo: project_url, anon_key (so the gateway lets the call through) and purge_cron_secret (the
-- same value as the function's PURGE_CRON_SECRET, which it checks). See README § Edge Functions.
--
-- ACCOUNT_DELETE_GRACE_DAYS (30) in src/lib/constants.ts is the same: change both.
-- Backwards compatible: no app code calls purge_deleted_accounts(); only the cron job did, and
-- it is replaced here. A plain Postgres (CI) has neither pg_cron nor pg_net, so the schedule is
-- skipped there.
-- =============================================================================

create or replace function public.accounts_due_for_purge()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;

revoke execute on function public.accounts_due_for_purge() from public, anon, authenticated;
grant execute on function public.accounts_due_for_purge() to service_role;

drop function if exists public.purge_deleted_accounts();

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    -- The same name as before, so this replaces the old job.
    perform cron.schedule(
      'purge-deleted-accounts',
      '17 3 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/purge-deleted-accounts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $job$
    );
  end if;
end $$;
