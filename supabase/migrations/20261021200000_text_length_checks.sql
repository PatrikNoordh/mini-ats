-- =============================================================================
-- Length limits for job and candidate text, held by the database (ATS-23)
--
-- The forms limit every text field, but a request made straight to the API could store text of
-- any length. These checks hold the same limits as src/lib/constants.ts. A limit changed in one
-- place must be changed in the other:
--
--   jobs.title              200   MAX_JOB_TITLE_LENGTH
--   jobs.location           200   MAX_JOB_LOCATION_LENGTH
--   jobs.description       5000   MAX_JOB_DESCRIPTION_LENGTH
--   candidates.full_name    200   MAX_NAME_LENGTH
--   candidates.email        254   MAX_EMAIL_LENGTH
--   candidates.phone         50   MAX_PHONE_LENGTH
--   candidates.linkedin_url 2048  MAX_URL_LENGTH
--   candidates.notes       5000   MAX_NOTES_LENGTH
--
-- char_length counts characters, so å, ä and ö are one each. The forms count UTF-16 units, which
-- is the same or stricter, so nothing a form accepts is refused here. Empty optional fields are
-- stored as null, and a check on null passes.
--
-- A refused value raises check_violation (23514) on a constraint named <table>_<column>_length,
-- which the app shows as `text_too_long` (docs/error-codes.md).
-- =============================================================================

-- Existing rows first: stop with a clear message instead of a bare constraint error if any row
-- is already too long. Nothing is applied then, and the rows are left for the developer.
do $$ declare too_long text; begin
  select string_agg(format('%s (%s rows)', col, n), ', ') into too_long
  from (
    select 'jobs.title' as col, count(*) as n from public.jobs where char_length(title) > 200
    union all select 'jobs.location', count(*) from public.jobs where char_length(location) > 200
    union all select 'jobs.description', count(*) from public.jobs where char_length(description) > 5000
    union all select 'candidates.full_name', count(*) from public.candidates where char_length(full_name) > 200
    union all select 'candidates.email', count(*) from public.candidates where char_length(email) > 254
    union all select 'candidates.phone', count(*) from public.candidates where char_length(phone) > 50
    union all select 'candidates.linkedin_url', count(*) from public.candidates where char_length(linkedin_url) > 2048
    union all select 'candidates.notes', count(*) from public.candidates where char_length(notes) > 5000
  ) counts
  where n > 0;
  if too_long is not null then
    raise exception 'ATS-23: rows are already longer than the new limits: %', too_long;
  end if;
end $$;

alter table public.jobs
  add constraint jobs_title_length       check (char_length(title) <= 200),
  add constraint jobs_location_length    check (char_length(location) <= 200),
  add constraint jobs_description_length check (char_length(description) <= 5000);

alter table public.candidates
  add constraint candidates_full_name_length    check (char_length(full_name) <= 200),
  add constraint candidates_email_length        check (char_length(email) <= 254),
  add constraint candidates_phone_length        check (char_length(phone) <= 50),
  add constraint candidates_linkedin_url_length check (char_length(linkedin_url) <= 2048),
  add constraint candidates_notes_length        check (char_length(notes) <= 5000);
