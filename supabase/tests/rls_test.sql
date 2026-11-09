-- =============================================================================
-- Mini-ATS — RLS tests
--
-- Runs in one transaction and rolls back, so it leaves no data behind.
-- Works in the Supabase SQL Editor, and against a plain Postgres after supabase/tests/local_stub.sql
-- and the migrations (that is how CI runs it).
-- Each check raises an exception on failure. "OK" notices mean the check passed.
-- =============================================================================
begin;

-- A customer's column by its default key, looked up past RLS, so a check can name another
-- customer's column. In pg_temp, so it is gone with the session.
create function pg_temp.stage_of(customer uuid, key text) returns uuid
language sql security definer set search_path = public as $$
  select id from public.pipeline_stages where customer_id = customer and default_key = key;
$$;

-- A customer as the companies migration leaves one (ATS-44): an account, a company under the same
-- id, and the account as its first member. add_member() adds a second user to a company. A second
-- member's id is not the company's, so only a check signed in as one shows a rule that still
-- compares customer_id with auth.uid(). Both run as the table owner, past RLS.
create function pg_temp.add_customer(new_id uuid, new_email text) returns uuid
language plpgsql as $$
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (new_id, new_email, '{"role":"customer"}', jsonb_build_object('company_name', 'Company ' || new_email));
  insert into public.companies (id, name) values (new_id, 'Company ' || new_email);
  insert into public.company_members (company_id, user_id) values (new_id, new_id);
  return new_id;
end;
$$;

create function pg_temp.add_member(company uuid, new_id uuid, new_email text) returns uuid
language plpgsql as $$
begin
  insert into auth.users (id, email, raw_app_meta_data) values (new_id, new_email, '{"role":"customer"}');
  insert into public.company_members (company_id, user_id) values (company, new_id);
  return new_id;
end;
$$;

-- Test users (fixed ids so the checks are readable)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', '{"role":"admin"}', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.local',     '{"role":"customer"}', '{"full_name":"A","company_name":"Company A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.local',     '{}', '{"full_name":"B","company_name":"Company B"}');

-- Companies A and B under their first users' ids, and a second member each: a2 and b2. The
-- customer checks sign in as the second member.
insert into public.companies (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Company A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Company B');
insert into public.company_members (company_id, user_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1');
select pg_temp.add_member('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'a2@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'b2@test.local');

-- Seed data as the table owner (bypasses RLS)
insert into public.jobs (id, customer_id, title) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Job A'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Job B');
insert into public.candidates (id, customer_id, full_name) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Cand A'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Cand B');
insert into public.applications (id, job_id, candidate_id) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1');

-- 1. Profiles are created by the trigger with the right role and email
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000ad') = 'admin', 'admin role';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'customer', 'default role';
  assert (select email from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'a@test.local', 'email copied';
  assert (select customer_id from public.applications where id = '30000000-0000-0000-0000-0000000000a1')
         = '00000000-0000-0000-0000-0000000000a1', 'application customer_id set by trigger';
  raise notice 'OK 1: profiles and application customer_id';
end $$;

-- ---------------------------------------------------------------- customer B
-- Signed in as b2, company B's second member, here and in the other customer B sections.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.jobs) = 1, 'B sees only own jobs';
  assert (select count(*) from public.candidates) = 1, 'B sees only own candidates';
  assert (select count(*) from public.applications) = 1, 'B sees only own applications';
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
  assert not exists (select 1 from public.jobs where customer_id = '00000000-0000-0000-0000-0000000000a1'), 'no A rows';
  raise notice 'OK 2: customer B cannot read customer A''s data';
end $$;

do $$ begin
  update public.jobs set title = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
  assert (select count(*) from public.jobs where title = 'hacked') = 0, 'B cannot update A job';
  delete from public.candidates where id = '20000000-0000-0000-0000-0000000000a1';
  raise notice 'OK 3: customer B cannot update or delete A''s rows (0 rows affected)';
end $$;

do $$ declare blocked boolean := false; begin
  begin
    insert into public.jobs (customer_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'planted');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 4: B could insert a job owned by A'; end if;
  raise notice 'OK 4: customer B cannot create rows for customer A';
end $$;

-- Refused by the table grants since ATS-22 (no update on profiles); before that RLS made it
-- affect 0 rows. Either way the role must not change.
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b2';
  exception when insufficient_privilege then null;
  end;
  reset role;
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b2') = 'customer', 'B promoted itself';
  raise notice 'OK 5: customer cannot make itself admin';
end $$;

set local role authenticated;
do $$ declare error_code text; begin
  begin
    insert into public.applications (job_id, candidate_id)
    values ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000b1');
  exception when raise_exception then error_code := sqlerrm;
  end;
  if error_code is distinct from 'job_candidate_customer_mismatch' then
    raise exception 'FAIL 6: B linked own candidate to A''s job (got %)', coalesce(error_code, 'no error');
  end if;
  raise notice 'OK 6: job and candidate must belong to the same customer (job_candidate_customer_mismatch)';
end $$;

do $$ begin
  update public.applications set stage_id = pg_temp.stage_of('00000000-0000-0000-0000-0000000000b1', 'interview')
  where id = '30000000-0000-0000-0000-0000000000b1';
  assert (select stage_id from public.applications where id = '30000000-0000-0000-0000-0000000000b1')
         = pg_temp.stage_of('00000000-0000-0000-0000-0000000000b1', 'interview'), 'stage';
  raise notice 'OK 7: customer can move own card';
end $$;

-- The app links a candidate without customer_id (the column default makes it optional). The
-- trigger sets it from the job, and replaces any value a client sends anyway.
do $$ declare candidate uuid; spoofed uuid; begin
  insert into public.candidates (customer_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Cand B2') returning id into candidate;
  insert into public.candidates (customer_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Cand B3') returning id into spoofed;
  insert into public.applications (job_id, candidate_id)
  values ('10000000-0000-0000-0000-0000000000b1', candidate);
  insert into public.applications (customer_id, job_id, candidate_id)
  values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1', spoofed);
  assert (select customer_id from public.applications where candidate_id = candidate)
         = '00000000-0000-0000-0000-0000000000b1', 'customer_id set from the job';
  assert (select customer_id from public.applications where candidate_id = spoofed)
         = '00000000-0000-0000-0000-0000000000b1', 'client customer_id overwritten';
  delete from public.candidates where id in (candidate, spoofed); -- the counts below expect the seed data only
  raise notice 'OK 7b: an application gets customer_id from the job, never from the client';
end $$;

-- move_application (ATS-12) puts a moved card last in its new column, in the same call.
do $$ declare candidate uuid; second uuid; first_pos int; second_pos int; again_pos int;
  offer uuid := pg_temp.stage_of('00000000-0000-0000-0000-0000000000b1', 'offer');
begin
  insert into public.candidates (customer_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Cand B4') returning id into candidate;
  insert into public.applications (job_id, candidate_id)
  values ('10000000-0000-0000-0000-0000000000b1', candidate) returning id into second;
  select position into first_pos from public.move_application(
    '30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', offer);
  select position into second_pos from public.move_application(
    second, '00000000-0000-0000-0000-0000000000b1', offer);
  select position into again_pos from public.move_application(
    '30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', offer);
  assert first_pos = 0, 'first card in an empty column gets position 0';
  assert second_pos = 1, 'next card lands after it';
  assert again_pos = 2, 'a card moved within its column goes last';
  assert (select stage_id from public.applications where id = second) = offer, 'stage changed';
  delete from public.candidates where id = candidate; -- the counts below expect the seed data only
  raise notice 'OK 7c: move_application sets the stage and the next position in one call';
end $$;

do $$ declare error_code text; other_code text; begin
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
      pg_temp.stage_of('00000000-0000-0000-0000-0000000000a1', 'hired'));
  exception when raise_exception then error_code := sqlerrm;
  end;
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
      pg_temp.stage_of('00000000-0000-0000-0000-0000000000b1', 'hired'));
  exception when raise_exception then other_code := sqlerrm;
  end;
  if error_code is distinct from 'card_not_found' or other_code is distinct from 'card_not_found' then
    raise exception 'FAIL 7d: B moved A''s card (got %, %)',
      coalesce(error_code, 'no error'), coalesce(other_code, 'no error');
  end if;
  raise notice 'OK 7d: customer B cannot move customer A''s card (card_not_found)';
end $$;

-- ---------------------------------------------------------------- admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
do $$ begin
  -- Only the test rows are counted: a real project has other customers' data too.
  assert (select count(*) from public.jobs where customer_id in
          ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1')) = 2,
         'admin sees all jobs';
  assert (select count(*) from public.candidates where customer_id in
          ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1')) = 2,
         'A''s candidate survived B''s delete attempt';
  assert (select count(*) from public.profiles where id in
          ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a1',
           '00000000-0000-0000-0000-0000000000b1')) = 3,
         'admin sees all profiles';
  insert into public.jobs (customer_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'Created by admin for A');
  raise notice 'OK 8: admin sees everything and can act for a customer';
end $$;

-- The default is the caller's id, the admin's here. The trigger must still use the job's customer.
do $$ declare job uuid; begin
  select id into job from public.jobs where title = 'Created by admin for A';
  insert into public.applications (job_id, candidate_id)
  values (job, '20000000-0000-0000-0000-0000000000a1');
  assert (select customer_id from public.applications where job_id = job)
         = '00000000-0000-0000-0000-0000000000a1', 'admin link belongs to the customer';
  raise notice 'OK 8b: an application an admin creates for a customer belongs to that customer';
end $$;

-- The admin moves a card for the active customer. The customer id must match the card's.
do $$ declare error_code text; begin
  assert (select stage_id from public.applications where id = '30000000-0000-0000-0000-0000000000a1')
         = pg_temp.stage_of('00000000-0000-0000-0000-0000000000a1', 'new'),
         'A''s card survived B''s move attempt';
  perform public.move_application(
    '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
    pg_temp.stage_of('00000000-0000-0000-0000-0000000000a1', 'screening'));
  assert (select stage_id from public.applications where id = '30000000-0000-0000-0000-0000000000a1')
         = pg_temp.stage_of('00000000-0000-0000-0000-0000000000a1', 'screening'),
         'admin moved A''s card';
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
      pg_temp.stage_of('00000000-0000-0000-0000-0000000000b1', 'hired'));
  exception when raise_exception then error_code := sqlerrm;
  end;
  if error_code is distinct from 'card_not_found' then
    raise exception 'FAIL 8c: admin moved A''s card while acting for B (got %)', coalesce(error_code, 'no error');
  end if;
  raise notice 'OK 8c: admin can move a card only for the customer it belongs to';
end $$;

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
-- anon has no table privileges at all (ATS-22), so a read is refused, not just empty.
do $$ declare tbl text; blocked boolean; begin
  foreach tbl in array array['profiles', 'jobs', 'candidates', 'applications', 'cv_assessments', 'pipeline_stages', 'companies', 'company_members'] loop
    blocked := false;
    begin
      execute format('select count(*) from public.%I', tbl);
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked then raise exception 'FAIL 9: a signed-out user could read %', tbl; end if;
  end loop;
  raise notice 'OK 9: signed-out users cannot read any table';
end $$;

do $$ declare blocked boolean := false; begin
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid());
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 9b: a signed-out user could call move_application'; end if;
  raise notice 'OK 9b: signed-out users cannot move cards';
end $$;

-- ---------------------------------------------------------------- storage
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ declare blocked boolean := false; begin
  begin
    insert into storage.objects (bucket_id, name) values ('cvs', '00000000-0000-0000-0000-0000000000a1/cv.pdf');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 10: B uploaded into A''s CV folder'; end if;
  raise notice 'OK 10: customer B cannot upload into customer A''s CV folder';
end $$;

-- ---------------------------------------------------------------- epic 6 hardening
-- These two passed with the original schema (the hole existed). After the epic 6 fix they must be rejected.
do $$ declare blocked boolean := false; begin
  begin
    insert into public.cv_assessments (customer_id, application_id, score, summary)
    values ('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000a1', 10, 'forged');
  exception when insufficient_privilege or raise_exception then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 11: B attached an AI assessment to A''s application'; end if;
  raise notice 'OK 11: clients cannot write AI assessments';
end $$;

do $$ declare blocked boolean := false; begin
  begin
    update public.candidates set cv_path = '00000000-0000-0000-0000-0000000000a1/cv.pdf'
    where id = '20000000-0000-0000-0000-0000000000b1';
  exception when check_violation or insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 12: B pointed its candidate''s cv_path at A''s folder'; end if;
  raise notice 'OK 12: cv_path must be inside the candidate''s own customer folder';
end $$;

-- ---------------------------------------------------------------- error codes
-- Runs as the table owner, the way assess-cv writes with the service role.
reset role;
do $$ declare error_code text; begin
  begin
    insert into public.cv_assessments (application_id, score)
    values ('30000000-0000-0000-0000-00000000dead', 5);
  exception when raise_exception then error_code := sqlerrm;
  end;
  if error_code is distinct from 'application_not_found' then
    raise exception 'FAIL 13: assessment for a missing application (got %)', coalesce(error_code, 'no error');
  end if;
  raise notice 'OK 13: an assessment needs an existing application (application_not_found)';
end $$;

-- ---------------------------------------------------------------- deletes (ATS-26)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$ begin
  delete from public.jobs where id = '10000000-0000-0000-0000-0000000000a1';
  delete from public.candidates where id = '20000000-0000-0000-0000-0000000000a1';
  reset role;
  assert exists (select 1 from public.jobs where id = '10000000-0000-0000-0000-0000000000a1'), 'A job survived';
  assert exists (select 1 from public.candidates where id = '20000000-0000-0000-0000-0000000000a1'), 'A candidate survived';
  raise notice 'OK 14: customer B cannot delete customer A''s job or candidate (0 rows affected)';
end $$;

set local role authenticated;
do $$ declare blocked boolean := false; begin
  begin
    delete from public.jobs where id = '10000000-0000-0000-0000-0000000000b1';
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 15: B deleted a job that still has a candidate'; end if;
  assert exists (select 1 from public.applications where job_id = '10000000-0000-0000-0000-0000000000b1'),
         'the card survived';
  raise notice 'OK 15: a job with candidates cannot be deleted (foreign_key_violation)';
end $$;

do $$ declare empty_job uuid; begin
  insert into public.jobs (customer_id, title)
  values ('00000000-0000-0000-0000-0000000000b1', 'Empty job') returning id into empty_job;
  delete from public.jobs where id = empty_job;
  assert not exists (select 1 from public.jobs where id = empty_job), 'empty job deleted';
  raise notice 'OK 16: customer can delete own job without candidates';
end $$;

do $$ begin
  delete from public.candidates where id = '20000000-0000-0000-0000-0000000000b1';
  assert not exists (select 1 from public.candidates where id = '20000000-0000-0000-0000-0000000000b1'), 'candidate deleted';
  assert not exists (select 1 from public.applications where candidate_id = '20000000-0000-0000-0000-0000000000b1'),
         'their applications deleted';
  delete from public.jobs where id = '10000000-0000-0000-0000-0000000000b1';
  assert not exists (select 1 from public.jobs where id = '10000000-0000-0000-0000-0000000000b1'),
         'the job can be deleted once it has no candidates';
  raise notice 'OK 17: deleting a candidate removes their cards, and then the job can be deleted';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
do $$ begin
  delete from public.candidates where id = '20000000-0000-0000-0000-0000000000a1';
  assert not exists (select 1 from public.candidates where id = '20000000-0000-0000-0000-0000000000a1'), 'admin deleted';
  raise notice 'OK 18: admin can delete a customer''s candidate';
end $$;

-- Deleting company A's first user, whose id is the company's, keeps everything the company owns:
-- no customer table references profiles or auth.users since ATS-44, so the delete reaches only
-- the user's profile and membership. Deleting the company then cascades to its jobs, candidates
-- and cards in one statement. The job foreign key checks at the end of the statement, so this
-- must still work.
reset role;
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  job uuid; candidate uuid; card uuid; path text;
  jobs_before integer; candidates_before integer; cards_before integer;
begin
  insert into public.jobs (customer_id, title) values (a, 'Job A2') returning id into job;
  insert into public.candidates (customer_id, full_name) values (a, 'Cand A2') returning id into candidate;
  path := a || '/' || candidate || '.pdf';
  update public.candidates set cv_path = path where id = candidate;
  insert into public.applications (job_id, candidate_id) values (job, candidate) returning id into card;
  select count(*) into jobs_before from public.jobs where customer_id = a;
  select count(*) into candidates_before from public.candidates where customer_id = a;
  select count(*) into cards_before from public.applications where customer_id = a;

  delete from auth.users where id = a;
  assert not exists (select 1 from public.company_members where user_id = a), 'the first user''s membership stayed';
  assert (select count(*) from public.jobs where customer_id = a) = jobs_before, 'deleting the first user removed jobs';
  assert (select count(*) from public.candidates where customer_id = a) = candidates_before,
         'deleting the first user removed candidates';
  assert (select count(*) from public.applications where customer_id = a) = cards_before,
         'deleting the first user removed cards';
  assert (select cv_path from public.candidates where id = candidate) = path, 'deleting the first user cleared a cv_path';
  assert exists (select 1 from public.company_members where company_id = a), 'the second member left with the first';

  delete from public.companies where id = a;
  assert not exists (select 1 from public.jobs where customer_id = a), 'jobs gone';
  assert not exists (select 1 from public.candidates where customer_id = a), 'candidates gone';
  assert not exists (select 1 from public.applications where customer_id = a), 'applications gone';
  assert not exists (select 1 from public.pipeline_stages where customer_id = a), 'columns gone';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
         'deleting the company removed its second user';
  raise notice 'OK 19: deleting a company''s first user keeps all its data and cv_path values, and deleting the company removes it';
end $$;

-- ---------------------------------------------------------------- table grants (ATS-22)
reset role;
do $$ declare tbl text; begin
  for tbl in select tablename from pg_tables where schemaname = 'public' loop
    if has_table_privilege('anon', format('public.%I', tbl), 'select, insert, update, delete, truncate, references, trigger') then
      raise exception 'FAIL 20: anon has a privilege on public.%', tbl;
    end if;
  end loop;
  raise notice 'OK 20: anon has no privilege on any table in public, also tables added later';
end $$;

-- Clients never create or change an assessment, not even an admin. Deleting one is allowed since
-- ATS-56 and checked in 44.
do $$ declare blocked boolean := false; begin
  assert not has_table_privilege('authenticated', 'public.cv_assessments', 'insert'), 'no insert';
  assert not has_table_privilege('authenticated', 'public.cv_assessments', 'update'), 'no update';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  begin
    update public.cv_assessments set score = 10;
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 21: even an admin client could change cv_assessments'; end if;
  raise notice 'OK 21: authenticated cannot create or change cv_assessments, not even an admin';
end $$;

-- The grants are exactly what the app uses. A change here is a deliberate change to this list.
do $$ declare actual text; expected text :=
  'applications:DELETE,INSERT,SELECT,UPDATE candidates:DELETE,INSERT,SELECT,UPDATE companies:SELECT '
  'company_members:SELECT cv_assessments:DELETE,SELECT jobs:DELETE,INSERT,SELECT,UPDATE '
  'pipeline_stages:DELETE,SELECT profiles:SELECT';
begin
  select string_agg(table_name || ':' || privileges, ' ' order by table_name) into actual
  from (
    select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
    group by table_name
  ) grants;
  if actual is distinct from expected then
    raise exception 'FAIL 22: authenticated grants are % (expected %)', actual, expected;
  end if;
  raise notice 'OK 22: authenticated has only the table privileges the app uses';
end $$;

-- ---------------------------------------------------------------- text lengths (ATS-23)
-- As customer B through the API path: a value at each limit is stored, one character more is
-- refused. å is one character, the way the forms and char_length count.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ declare
  job uuid; candidate uuid; rec record; refused boolean;
begin
  insert into public.jobs (customer_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'Length job')
    returning id into job;
  insert into public.candidates (customer_id, full_name) values ('00000000-0000-0000-0000-0000000000b1', 'Length cand')
    returning id into candidate;
  for rec in select * from (values
    ('jobs', 'title', 200), ('jobs', 'location', 200), ('jobs', 'description', 5000),
    ('candidates', 'full_name', 200), ('candidates', 'email', 254), ('candidates', 'phone', 50),
    ('candidates', 'notes', 5000)
  ) as limits (tbl, col, max_length) loop
    execute format('update public.%I set %I = repeat(''å'', %s) where id = $1', rec.tbl, rec.col, rec.max_length)
      using case rec.tbl when 'jobs' then job else candidate end;
    refused := false;
    begin
      execute format('update public.%I set %I = repeat(''å'', %s) where id = $1', rec.tbl, rec.col, rec.max_length + 1)
        using case rec.tbl when 'jobs' then job else candidate end;
    exception when check_violation then refused := true;
    end;
    if not refused then raise exception 'FAIL 23: %.% accepted % characters', rec.tbl, rec.col, rec.max_length + 1; end if;
  end loop;
  -- linkedin_url must also match its URL check, so it is padded after a valid start.
  update public.candidates set linkedin_url = rpad('https://www.linkedin.com/in/', 2048, 'å') where id = candidate;
  refused := false;
  begin
    update public.candidates set linkedin_url = rpad('https://www.linkedin.com/in/', 2049, 'å') where id = candidate;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL 23: candidates.linkedin_url accepted 2049 characters'; end if;
  update public.candidates set email = null, phone = null, linkedin_url = null, notes = null where id = candidate;
  delete from public.candidates where id = candidate;
  delete from public.jobs where id = job;
  raise notice 'OK 23: every job and candidate text is stored at its limit and refused one character over';
end $$;

-- ---------------------------------------------------------------- role from app_metadata (ATS-28)
-- Auth's admin API inserts the user without app_metadata and sets it in a later update. The
-- profile must end up with the role from that update.
reset role;
do $$ declare
  account uuid := '00000000-0000-0000-0000-0000000000c2';
begin
  insert into auth.users (id, email, raw_app_meta_data)
  values (account, 'new-admin@test.local', '{"provider":"email","providers":["email"]}');
  assert (select role from public.profiles where id = account) = 'customer', 'no role yet at insert';

  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where id = account;
  assert (select role from public.profiles where id = account) = 'admin', 'role copied from app_metadata';

  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"owner"}' where id = account;
  assert (select role from public.profiles where id = account) = 'admin', 'an unknown role changes nothing';

  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin","provider":"github"}'
  where id = account;
  assert (select role from public.profiles where id = account) = 'admin', 'other keys change nothing';

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', account), true);
  assert public.is_admin(), 'is_admin() is true for the new admin';
  reset role;

  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"customer"}' where id = account;
  assert (select role from public.profiles where id = account) = 'customer', 'a role change is copied too';
  delete from auth.users where id = account;
  raise notice 'OK 24: an account created as admin through Auth''s insert-then-update gets the admin role';
end $$;

-- ---------------------------------------------------------------- deleted accounts (ATS-27)
-- Company D with its first user and a second member, and a second admin.
reset role;
do $$ declare
  customer uuid := '00000000-0000-0000-0000-0000000000d1';
  member uuid := '00000000-0000-0000-0000-0000000000d3';
  admin2 uuid := '00000000-0000-0000-0000-0000000000d2';
  job uuid; blocked boolean := false;
begin
  perform pg_temp.add_customer(customer, 'deleted-customer@test.local');
  perform pg_temp.add_member(customer, member, 'deleted-member@test.local');
  insert into auth.users (id, email, raw_app_meta_data) values (admin2, 'deleted-admin@test.local', '{"role":"admin"}');
  insert into public.jobs (customer_id, title) values (customer, 'Kept job') returning id into job;

  -- 25. A customer cannot mark or unmark itself as deleted: there is no client update on profiles.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', member), true);
  begin
    update public.profiles set deleted_at = now() where id = member;
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 25: a customer could set its own deleted_at'; end if;
  raise notice 'OK 25: a client cannot set or clear deleted_at';

  -- 26. A deleted member's token sees no rows and cannot write. The company's other members keep
  -- working, and its data is kept.
  update public.profiles set deleted_at = now() where id in (member, admin2);
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', member), true);
  assert (select count(*) from public.jobs) = 0, 'a deleted member sees jobs';
  assert (select count(*) from public.profiles) = 0, 'a deleted member sees even its own profile';
  assert (select count(*) from public.companies) = 0, 'a deleted member sees its company';
  blocked := false;
  begin
    insert into public.jobs (customer_id, title) values (customer, 'After delete');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 26: a deleted member could still create a job'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', customer), true);
  assert (select count(*) from public.jobs) = 1, 'the company''s other member lost its jobs';
  reset role;
  assert exists (select 1 from public.jobs where id = job), 'the data is kept';
  raise notice 'OK 26: a deleted member''s token gets no rows, the other members keep working, and the data is kept';

  -- 27. A deleted admin is no admin; an active admin still sees the deleted account and its data.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin2), true);
  assert not public.is_admin(), 'a deleted admin is not an admin';
  assert (select count(*) from public.jobs) = 0, 'a deleted admin sees nothing';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  assert exists (select 1 from public.profiles where id = member and deleted_at is not null), 'admin sees the deleted account';
  assert exists (select 1 from public.jobs where id = job), 'admin sees its data, for restoring';
  reset role;
  raise notice 'OK 27: a deleted admin is not an admin, and an active admin still sees deleted accounts';

  -- 28. Only accounts deleted more than 30 days ago are due for the purge (the
  -- purge-deleted-accounts function, ATS-17), and never one whose id is a company's: the purge
  -- deployed from main removes the CV folder named after the user, which for a company's first
  -- user is the company's (ATS-44). Deleting a member's user leaves the company's data.
  update public.profiles set deleted_at = now() - interval '29 days' where id = member;
  update public.profiles set deleted_at = now() - interval '31 days' where id in (admin2, customer);
  assert admin2 in (select public.accounts_due_for_purge()), 'deleted 31 days ago: due';
  assert member not in (select public.accounts_due_for_purge()), 'deleted 29 days ago: not due';
  assert customer not in (select public.accounts_due_for_purge()), 'a company''s first user is due';
  update public.profiles set deleted_at = now() - interval '31 days' where id = member;
  assert member in (select public.accounts_due_for_purge()), 'a member deleted 31 days ago: due';
  assert '00000000-0000-0000-0000-0000000000ad' not in (select public.accounts_due_for_purge()), 'active admin not due';
  assert not has_function_privilege('anon', 'public.accounts_due_for_purge()', 'execute'), 'anon cannot list';
  assert not has_function_privilege('authenticated', 'public.accounts_due_for_purge()', 'execute'), 'no client can list';
  assert to_regprocedure('public.purge_deleted_accounts()') is null, 'the SQL purge is gone';
  delete from auth.users where id = member;
  assert exists (select 1 from public.jobs where id = job), 'deleting a member removed the company''s jobs';
  raise notice 'OK 28: only accounts deleted more than 30 days ago are due for the purge, never a company''s first user, and no client can list them';
end $$;

-- ---------------------------------------------------------------- removing a job link (ATS-30)
-- Its own customers: customer A is deleted by check 19.
reset role;
do $$ declare
  owner uuid := gen_random_uuid(); other uuid := gen_random_uuid(); gone uuid := gen_random_uuid();
  owner_member uuid := gen_random_uuid();
  job1 uuid; job2 uuid; cand uuid; app1 uuid; app2 uuid; n integer; blocked boolean := false;
begin
  perform pg_temp.add_customer(owner, 'owner-30@test.local');
  perform pg_temp.add_member(owner, owner_member, 'owner-member-30@test.local');
  perform pg_temp.add_customer(other, 'other-30@test.local');
  perform pg_temp.add_customer(gone, 'gone-30@test.local');
  insert into public.jobs (customer_id, title) values (owner, 'Job 1') returning id into job1;
  insert into public.jobs (customer_id, title) values (owner, 'Job 2') returning id into job2;
  insert into public.candidates (customer_id, full_name) values (owner, 'Linked twice') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job1, cand) returning id into app1;
  insert into public.applications (job_id, candidate_id) values (job2, cand) returning id into app2;
  insert into public.cv_assessments (application_id, score) values (app1, 7);

  -- Another customer cannot remove the owner's link: 0 rows.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', other), true);
  delete from public.applications where id = app1;
  get diagnostics n = row_count;
  assert n = 0, 'another customer removed the link';

  -- The owner's second member removes its link; the assessment goes with it, the candidate and
  -- job stay.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', owner_member), true);
  delete from public.applications where id = app1;
  get diagnostics n = row_count;
  assert n = 1, 'the owner could not remove its own link';
  reset role;
  assert not exists (select 1 from public.cv_assessments where application_id = app1), 'the assessment went with the card';
  assert exists (select 1 from public.candidates where id = cand), 'the candidate stays';
  assert exists (select 1 from public.jobs where id = job1), 'the job stays';

  -- An admin acting for the owner removes its other link.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  delete from public.applications where id = app2;
  get diagnostics n = row_count;
  assert n = 1, 'the admin could not remove the owner''s link';

  -- A deleted account (ATS-27) cannot remove its links, even with its old token.
  reset role;
  insert into public.jobs (customer_id, title) values (gone, 'Gone job') returning id into job1;
  insert into public.candidates (customer_id, full_name) values (gone, 'Gone cand') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job1, cand) returning id into app1;
  update public.profiles set deleted_at = now() where id = gone;
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', gone), true);
  delete from public.applications where id = app1;
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'a deleted account removed a link';

  -- Signed out: no privilege at all.
  set local role anon;
  begin
    delete from public.applications where id = app1;
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 29: anon could delete an application'; end if;
  assert exists (select 1 from public.applications where id = app1), 'the deleted account''s card is kept';
  raise notice 'OK 29: a customer and an admin remove a job link with its assessment; another customer, a deleted account and anon cannot';
end $$;

-- ---------------------------------------------------------------- last admin (ATS-33)
-- The Edge Function runs soft_delete_or_demote_account with the service role. Every other active
-- admin is marked deleted here (rolled back at the end), so the check works in the SQL Editor
-- against a project with real admins too. Two concurrent calls: last_admin_concurrency.sh.
reset role;
do $$ declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000ad';
  second uuid := gen_random_uuid(); third uuid := gen_random_uuid(); customer uuid := gen_random_uuid();
  blocked boolean; client_role text; change_name text;
begin
  insert into auth.users (id, email, raw_app_meta_data) values
    (second, 'second-33@test.local', '{"role":"admin"}'),
    (third, 'third-33@test.local', '{"role":"admin"}'),
    (customer, 'customer-33@test.local', '{"role":"customer"}');
  update public.profiles set deleted_at = now()
  where role = 'admin' and deleted_at is null and id not in (admin_id, second, third);

  -- No client can run it: not signed out, not signed in, not even as an admin.
  foreach client_role in array array['anon', 'authenticated'] loop
    assert not has_function_privilege(client_role, 'public.soft_delete_or_demote_account(uuid, text)', 'execute'),
      client_role || ' can execute soft_delete_or_demote_account';
  end loop;
  blocked := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin_id), true);
  begin
    perform public.soft_delete_or_demote_account(second, 'soft_delete');
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 30: an admin''s token could run soft_delete_or_demote_account'; end if;

  -- Three active admins: one is deleted and one demoted; the last one stays.
  set local role service_role;
  perform public.soft_delete_or_demote_account(second, 'soft_delete');
  perform public.soft_delete_or_demote_account(third, 'demote');
  perform public.soft_delete_or_demote_account(customer, 'soft_delete');
  reset role;
  assert (select deleted_at is not null from public.profiles where id = second), 'second admin deleted';
  assert (select role from public.profiles where id = third) = 'customer', 'third admin demoted';
  assert (select deleted_at is not null from public.profiles where id = customer), 'customer deleted';

  set local role service_role;
  foreach change_name in array array['soft_delete', 'demote'] loop
    begin
      perform public.soft_delete_or_demote_account(admin_id, change_name);
      raise exception 'FAIL 30: the last active admin could be removed (%)', change_name;
    exception when raise_exception then
      if sqlerrm <> 'last_admin' then raise; end if;
    end;
  end loop;
  begin
    perform public.soft_delete_or_demote_account(second, 'soft_delete');
    raise exception 'FAIL 30: a deleted account was deleted again';
  exception when raise_exception then
    if sqlerrm <> 'account_deleted' then raise; end if;
  end;
  begin
    perform public.soft_delete_or_demote_account(gen_random_uuid(), 'demote');
    raise exception 'FAIL 30: an unknown account was changed';
  exception when raise_exception then
    if sqlerrm <> 'account_not_found' then raise; end if;
  end;
  reset role;
  assert (select role = 'admin' and deleted_at is null from public.profiles where id = admin_id), 'the last admin is untouched';
  raise notice 'OK 30: the last active admin cannot be deleted or demoted, and no client can run the function';
end $$;

-- ---------------------------------------------------------------- CV bucket (ATS-17)
-- The bucket refuses big files and anything but PDF on the server. A CV is replaced in place
-- (upsert), which needs the update policy: the company's folder while the member and the company
-- are active, or an admin. Since ATS-44 the folder is the company id, so a second member opens,
-- uploads, replaces and removes the company's CVs too, and no other company's.
reset role;
do $$ declare
  -- Not named owner: storage.objects has an owner column, and PL/pgSQL would not know which.
  cv_owner uuid := gen_random_uuid(); cv_other uuid := gen_random_uuid(); cv_gone uuid := gen_random_uuid();
  cv_member uuid := gen_random_uuid();
  n integer; blocked boolean := false;
begin
  assert (select file_size_limit from storage.buckets where id = 'cvs') = 5 * 1024 * 1024, 'cvs limit is 5 MB';
  assert (select allowed_mime_types from storage.buckets where id = 'cvs') = array['application/pdf'], 'cvs takes only PDF';

  perform pg_temp.add_customer(cv_owner, 'owner-17@test.local');
  perform pg_temp.add_member(cv_owner, cv_member, 'member-17@test.local');
  perform pg_temp.add_customer(cv_other, 'other-17@test.local');
  perform pg_temp.add_customer(cv_gone, 'gone-17@test.local');
  insert into storage.objects (bucket_id, name) values
    ('cvs', cv_owner || '/cv-owner.pdf'), ('cvs', cv_other || '/cv-other.pdf'), ('cvs', cv_gone || '/cv-gone.pdf');
  update public.profiles set deleted_at = now() where id = cv_gone;

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cv_member), true);
  assert (select count(*) from storage.objects where bucket_id = 'cvs') = 1, 'a member sees another company''s CVs, or not its own';
  insert into storage.objects (bucket_id, name) values ('cvs', cv_owner || '/new.pdf');
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_owner || '/cv-owner.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'a member could not replace its company''s CV';
  -- Supabase refuses a delete from storage.objects unless this is set, as the Storage API sets it;
  -- the policies still decide which rows it reaches. The plain Postgres in CI has no such guard.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'cvs' and name = cv_owner || '/new.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'a member could not remove its company''s CV';
  delete from storage.objects where bucket_id = 'cvs' and name = cv_other || '/cv-other.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a member removed another company''s CV';
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_other || '/cv-other.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a customer replaced another customer''s CV';
  begin
    update storage.objects set name = cv_other || '/moved.pdf' where bucket_id = 'cvs' and name = cv_owner || '/cv-owner.pdf';
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 31: a customer moved its CV into another customer''s folder'; end if;
  blocked := false;
  begin
    insert into storage.objects (bucket_id, name) values ('cvs', cv_member || '/own-id.pdf');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 31: a member uploaded into a folder named after its own user id'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cv_gone), true);
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_gone || '/cv-gone.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a deleted account replaced its CV';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_other || '/cv-other.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'the admin could not replace a customer''s CV';

  -- Signed out: Supabase grants anon on storage.objects, so RLS alone must refuse. The claims
  -- are a signed-out request's, without sub; the admin's would still be set from above.
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_owner || '/cv-owner.pdf';
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'anon replaced a CV';
  raise notice 'OK 31: the cvs bucket takes PDFs up to 5 MB, and every member of the company while active, or an admin, opens, uploads, replaces and removes its CVs';
end $$;

-- ---------------------------------------------------------------- CV upload time (ATS-35)
-- The database stamps cv_uploaded_at whenever cv_path is written, also with the same path (a CV
-- replaced in place), clears it with cv_path, and ignores it from the client.
reset role;
do $$ declare
  customer uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  cand uuid;
  path text;
  first_upload timestamptz;
begin
  perform pg_temp.add_customer(customer, 'cv-time-35@test.local');
  perform pg_temp.add_member(customer, member, 'cv-time-member-35@test.local');
  insert into public.candidates (customer_id, full_name) values (customer, 'Cand 35') returning id into cand;
  path := customer || '/' || cand || '.pdf';
  assert (select cv_uploaded_at from public.candidates where id = cand) is null, 'a candidate without a CV has a CV time';

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', member), true);
  update public.candidates set cv_path = path where id = cand;
  first_upload := (select cv_uploaded_at from public.candidates where id = cand);
  assert first_upload is not null, 'an upload did not stamp cv_uploaded_at';

  update public.candidates set cv_uploaded_at = now() - interval '1 year', full_name = 'Cand 35b' where id = cand;
  assert (select cv_uploaded_at from public.candidates where id = cand) = first_upload,
    'a client changed cv_uploaded_at';

  update public.candidates set cv_path = path where id = cand;
  assert (select cv_uploaded_at from public.candidates where id = cand) > first_upload,
    'replacing the CV at the same path did not stamp a new time';

  update public.candidates set cv_path = null where id = cand;
  assert (select cv_uploaded_at from public.candidates where id = cand) is null,
    'removing the CV did not clear cv_uploaded_at';
  reset role;
  raise notice 'OK 32: the database stamps when a CV is uploaded or replaced, clears it with the CV, and a client cannot set it';
end $$;

-- ---------------------------------------------------------------- role change in Auth (ATS-35)
-- A change of app_metadata.role outside admin-manage-account (the Dashboard, a script) goes
-- through the same last-admin lock: it can demote an admin, but never the last active one.
reset role;
do $$ declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000ad';
  other uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_app_meta_data) values (other, 'other-35@test.local', '{"role":"admin"}');
  update public.profiles set deleted_at = now()
  where role = 'admin' and deleted_at is null and id not in (admin_id, other);

  update auth.users set raw_app_meta_data = '{"role":"customer"}' where id = other;
  assert (select role from public.profiles where id = other) = 'customer', 'an admin with another active admin was not demoted';

  begin
    update auth.users set raw_app_meta_data = '{"role":"customer"}' where id = admin_id;
    raise exception 'FAIL 33: the last active admin was demoted through app_metadata';
  exception when raise_exception then
    if sqlerrm <> 'last_admin' then raise; end if;
  end;
  assert (select role from public.profiles where id = admin_id) = 'admin', 'the last admin lost its role';
  assert (select raw_app_meta_data ->> 'role' from auth.users where id = admin_id) = 'admin',
    'the refused change was kept in app_metadata';

  update auth.users set raw_app_meta_data = '{}' where id = other;
  assert (select role from public.profiles where id = other) = 'customer',
    'an account whose role was removed from app_metadata lost its profile role';
  raise notice 'OK 33: a role change in app_metadata demotes an admin, but never the last active one, and a removed role keeps the profile''s';
end $$;

-- ---------------------------------------------------------------- assessments go with the CV (ATS-35)
-- Removing a CV removes the candidate's assessments, and only theirs. Replacing it keeps them.
reset role;
do $$ declare
  customer uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  job uuid; cand uuid; other uuid; app uuid; other_app uuid;
begin
  perform pg_temp.add_customer(customer, 'cv-gone-35@test.local');
  perform pg_temp.add_member(customer, member, 'cv-gone-member-35@test.local');
  insert into public.jobs (customer_id, title) values (customer, 'Job 35') returning id into job;
  insert into public.candidates (customer_id, full_name, cv_path) values (customer, 'With CV', customer || '/x.pdf') returning id into cand;
  insert into public.candidates (customer_id, full_name, cv_path) values (customer, 'Other', customer || '/y.pdf') returning id into other;
  insert into public.applications (job_id, candidate_id) values (job, cand) returning id into app;
  insert into public.applications (job_id, candidate_id) values (job, other) returning id into other_app;
  insert into public.cv_assessments (application_id, score) values (app, 5), (other_app, 6);

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', member), true);
  update public.candidates set cv_path = customer || '/x.pdf' where id = cand;
  assert (select count(*) from public.cv_assessments where application_id = app) = 1, 'replacing the CV removed its assessment';
  update public.candidates set cv_path = null where id = cand;
  assert (select count(*) from public.cv_assessments where application_id = app) = 0, 'removing the CV kept its assessment';
  assert (select count(*) from public.cv_assessments where application_id = other_app) = 1, 'another candidate''s assessment was removed';
  reset role;
  raise notice 'OK 34: removing a CV removes the candidate''s assessments, and only theirs';
end $$;

-- ---------------------------------------------------------------- pipeline stages (ATS-38)
-- Companies A2 and B2, each with a second member who signs in for it, and the admin, with a card
-- each. error_of() runs a statement as the
-- current role and returns its error code: the message for a raised code, the SQLSTATE otherwise,
-- and null when it succeeds. It lives in pg_temp, so it is gone with the session.
reset role;
create function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return case when sqlstate = 'P0001' then sqlerrm else sqlstate end;
end;
$$;

select pg_temp.add_customer('00000000-0000-0000-0000-0000000038a1', 'stages-a-38@test.local');
select pg_temp.add_customer('00000000-0000-0000-0000-0000000038b1', 'stages-b-38@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a2', 'stages-a2-38@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038b2', 'stages-b2-38@test.local');
insert into public.jobs (id, customer_id, title) values
  ('10000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a1', 'Job A 38'),
  ('10000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038b1', 'Job B 38');
insert into public.candidates (id, customer_id, full_name) values
  ('20000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a1', 'Cand A 38'),
  ('20000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038b1', 'Cand B 38');
insert into public.applications (id, job_id, candidate_id) values
  ('30000000-0000-0000-0000-0000000038a1', '10000000-0000-0000-0000-0000000038a1', '20000000-0000-0000-0000-0000000038a1'),
  ('30000000-0000-0000-0000-0000000038b1', '10000000-0000-0000-0000-0000000038b1', '20000000-0000-0000-0000-0000000038b1');

do $$ begin
  assert (select string_agg(default_key || ':' || kind || ':' || colour, ',' order by position)
          from public.pipeline_stages where customer_id = '00000000-0000-0000-0000-0000000038a1')
         = 'new:open:grey,screening:open:blue,interview:open:violet,offer:open:amber,hired:hired:green,rejected:rejected:red',
         'a new company gets the six default columns in order';
  assert not exists (select 1 from public.pipeline_stages
                     where customer_id = '00000000-0000-0000-0000-0000000038a1' and name is not null),
         'the defaults have no name of their own';
  assert not exists (select 1 from public.companies c
                     where not exists (select 1 from public.pipeline_stages s where s.customer_id = c.id)),
         'a company has no columns';
  assert not exists (select 1 from public.pipeline_stages s
                     where not exists (select 1 from public.companies c where c.id = s.customer_id)),
         'a user has columns of their own';
  assert not exists (select 1 from public.applications where stage_id is null), 'a card has no stage_id';
  assert (select stage_id from public.applications where id = '30000000-0000-0000-0000-0000000038a1')
         = pg_temp.stage_of('00000000-0000-0000-0000-0000000038a1', 'new'), 'a new card is in the new column';
  raise notice 'OK 35: every company has the six default columns, no user has any of their own, and every card has a column';
end $$;

-- stage_changed_at follows stage_id, and not a move within the column. now() is the same for the
-- whole transaction, so the card's stage_changed_at is set back before each change. Since ATS-42
-- stage_id is the only column a card has: applications.stage and the functions that kept it in
-- step are gone, and stage_id is required.
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
  card uuid := '30000000-0000-0000-0000-0000000038a1';
  custom uuid;
  long_ago timestamptz := '2026-01-01';
begin
  update public.applications set stage_changed_at = long_ago where id = card;
  update public.applications set stage_id = pg_temp.stage_of(a, 'offer') where id = card;
  assert (select stage_changed_at = now() from public.applications where id = card),
         'a stage_id change did not set stage_changed_at';

  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (a, 'Kodtest', 6, 'open', 'teal') returning id into custom;
  update public.applications set stage_changed_at = long_ago where id = card;
  update public.applications set stage_id = custom where id = card;
  assert (select stage_changed_at = now() from public.applications where id = card),
         'a move to a column the customer added did not set stage_changed_at';

  update public.applications set stage_changed_at = long_ago where id = card;
  update public.applications set position = 7 where id = card;
  assert (select stage_changed_at = long_ago from public.applications where id = card),
         'a move within the column changed stage_changed_at';

  update public.applications set stage_id = pg_temp.stage_of(a, 'new') where id = card;
  delete from public.pipeline_stages where id = custom;

  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'applications' and column_name = 'stage'),
         'applications.stage is still there';
  assert (select is_nullable = 'NO' from information_schema.columns
          where table_schema = 'public' and table_name = 'applications' and column_name = 'stage_id'),
         'stage_id is not required';
  assert to_regprocedure('public.move_application(uuid, uuid, text)') is null, 'move_application by stage name is still there';
  assert to_regprocedure('public.stage_id_for_key(uuid, text)') is null, 'stage_id_for_key is still there';
  assert to_regprocedure('public.sync_application_stage()') is null, 'the sync trigger function is still there';
  assert pg_temp.error_of(format('update public.applications set stage_id = null where id = %L', card)) = '23502',
         'a card could lose its column';
  raise notice 'OK 36: stage_changed_at follows stage_id, and stage_id is the only, required column a card has';
end $$;

-- The kind rules, the name rules and the limit, as customer A2.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038a2","role":"authenticated"}', true);
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
  second_rejected uuid;
  extra int;
begin
  assert pg_temp.error_of(format('delete from public.pipeline_stages where id = %L', pg_temp.stage_of(a, 'hired')))
         = 'stage_hired_required', 'the hired column could be removed';
  assert pg_temp.error_of(format('update public.pipeline_stages set kind = ''open'' where id = %L', pg_temp.stage_of(a, 'hired')))
         = 'stage_hired_required', 'the hired column could become open';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''Anställd 2'', 6, ''hired'', ''green'')', a))
         = '23505', 'a second hired column was accepted';
  assert pg_temp.error_of(format('delete from public.pipeline_stages where id = %L', pg_temp.stage_of(a, 'rejected')))
         = 'stage_rejected_required', 'the only rejected column could be removed';

  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (a, 'Nej tack', 6, 'rejected', 'red') returning id into second_rejected;
  delete from public.pipeline_stages where id = pg_temp.stage_of(a, 'rejected');
  assert pg_temp.error_of(format('update public.pipeline_stages set kind = ''open'' where id = %L', second_rejected))
         = 'stage_rejected_required', 'the last rejected column could become open';

  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, '' nej TACK '', 7, ''open'', ''grey'')', a))
         = '23505', 'a name differing only in case and spaces was accepted';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, %L, 7, ''open'', ''grey'')', a, repeat('x', 51)))
         = '23514', 'a name over 50 characters was accepted';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''   '', 7, ''open'', ''grey'')', a))
         = '23514', 'a blank name was accepted';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''Lila'', 7, ''open'', ''purple'')', a))
         = '23514', 'a colour outside the palette was accepted';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''Krock'', 0, ''open'', ''grey'')', a))
         = '23505', 'two columns got the same position';

  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (a, repeat('x', 50), 7, 'open', 'grey');
  for extra in 8..10 loop
    insert into public.pipeline_stages (customer_id, name, position, kind, colour)
    values (a, 'Extra ' || extra, extra, 'open', 'grey');
  end loop;
  assert (select count(*) from public.pipeline_stages where customer_id = a) = 10, 'ten columns';
  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''Elva'', 11, ''open'', ''grey'')', a))
         = 'stage_limit_reached', 'an eleventh column was accepted';

  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, default_key, position, kind, colour) values (%L, ''offer'', 10, ''open'', ''grey'')', a))
         = '42501', 'a client set default_key';
  assert pg_temp.error_of(format('update public.pipeline_stages set default_key = ''new'' where id = %L', second_rejected))
         = '42501', 'a client changed default_key';
  assert pg_temp.error_of(format('update public.pipeline_stages set customer_id = %L where id = %L',
                                 '00000000-0000-0000-0000-0000000038b1', second_rejected))
         = '42501', 'a client moved a column to another customer';

  update public.pipeline_stages set name = 'Kodtest' where id = pg_temp.stage_of(a, 'interview');
  assert (select name = 'Kodtest' and kind = 'open' from public.pipeline_stages where id = pg_temp.stage_of(a, 'interview')),
         'a customer renames its own column';
  delete from public.pipeline_stages where customer_id = a and name like 'Extra %';
  raise notice 'OK 37: one hired and at least one rejected column, unique names up to 50 characters, at most 10 columns, and no client-set default_key or customer_id';
end $$;

-- A column with cards cannot be removed, and an empty one can.
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
begin
  perform public.move_application('30000000-0000-0000-0000-0000000038a1', a, pg_temp.stage_of(a, 'screening'));
  assert pg_temp.error_of(format('delete from public.pipeline_stages where id = %L', pg_temp.stage_of(a, 'screening')))
         = '23503', 'a column with a card was removed';
  delete from public.pipeline_stages where id = pg_temp.stage_of(a, 'offer');
  assert pg_temp.stage_of(a, 'offer') is null, 'an empty column was not removed';
  raise notice 'OK 38: a column with cards cannot be removed (foreign_key_violation), an empty one can';
end $$;

-- move_application and reorder_stages by stage id.
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
  ids uuid[];
  moved public.applications;
  candidate uuid;
  second uuid;
begin
  insert into public.candidates (customer_id, full_name) values (a, 'Cand A 38b') returning id into candidate;
  insert into public.applications (job_id, candidate_id)
  values ('10000000-0000-0000-0000-0000000038a1', candidate) returning id into second;
  moved := public.move_application(second, a, pg_temp.stage_of(a, 'screening'));
  assert moved.stage_id = pg_temp.stage_of(a, 'screening') and moved.position = 1,
         'a card moved by id goes last in its column';

  select array_agg(id order by position desc) into ids from public.pipeline_stages where customer_id = a;
  assert (select array_agg(id) from public.reorder_stages(a, ids)) = ids, 'reorder_stages returns the new order';
  assert (select array_agg(id order by position) from public.pipeline_stages where customer_id = a) = ids,
         'the columns are in the new order';
  assert (select array_agg(position order by position) from public.pipeline_stages where customer_id = a)
         = (select array_agg(n) from generate_series(0, cardinality(ids) - 1) n), 'positions are 0 to n - 1';

  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', a, ids[2:])) = 'invalid_input',
         'a reorder that leaves a column out was accepted';
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', a, ids || ids[1])) = 'invalid_input',
         'a reorder that names a column twice was accepted';
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', a, '{}'::uuid[])) = 'stage_not_found',
         'an empty reorder was accepted';
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', a, ids || gen_random_uuid())) = 'stage_not_found',
         'a reorder with an unknown column was accepted';
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', second, a, gen_random_uuid())) = 'stage_not_found',
         'a move to an unknown column was accepted';
  delete from public.candidates where id = candidate;
  raise notice 'OK 39: move_application and reorder_stages work by stage id and refuse a wrong list';
end $$;

-- Customer B2 cannot read, create, rename, reorder or delete A2's columns, or move a card into one.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038b2","role":"authenticated"}', true);
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
  b uuid := '00000000-0000-0000-0000-0000000038b1';
  a_ids uuid[];
  a_stage uuid;
begin
  assert not exists (select 1 from public.pipeline_stages where customer_id <> b), 'B sees another customer''s columns';
  assert (select count(*) from public.pipeline_stages) = 6, 'B sees its own six columns';
  reset role;
  select array_agg(id order by position) into a_ids from public.pipeline_stages where customer_id = a;
  a_stage := pg_temp.stage_of(a, 'new');
  set local role authenticated;

  assert pg_temp.error_of(format(
           'insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (%L, ''Planterad'', 9, ''open'', ''grey'')', a))
         = '42501', 'B created a column for A';
  update public.pipeline_stages set name = 'hacked' where id = any (a_ids);
  delete from public.pipeline_stages where id = any (a_ids);
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', a, a_ids)) = 'stage_not_found', 'B reordered A''s columns';
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', b, a_ids)) = 'stage_not_found', 'B reordered A''s columns as its own';
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', '30000000-0000-0000-0000-0000000038b1', b, a_stage))
         = 'stage_not_found', 'B moved its card into A''s column';
  -- Since ATS-42 no trigger looks at an update: the foreign key alone keeps a card in its own
  -- customer's columns.
  assert pg_temp.error_of(format('update public.applications set stage_id = %L where id = %L', a_stage, '30000000-0000-0000-0000-0000000038b1'))
         = '23503', 'B pointed its card at A''s column';
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', '30000000-0000-0000-0000-0000000038a1', a, a_stage))
         = 'card_not_found', 'B moved A''s card';

  reset role;
  assert (select array_agg(id order by position) from public.pipeline_stages where customer_id = a) = a_ids,
         'A''s columns were changed, removed or reordered';
  assert not exists (select 1 from public.pipeline_stages where customer_id = a and name = 'hacked'), 'B renamed A''s column';

  raise notice 'OK 40: customer B cannot read, create, rename, reorder or delete A''s columns, or move a card into one';
end $$;

-- The admin acts for A2 through the active customer, never across customers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000038a1';
  b uuid := '00000000-0000-0000-0000-0000000038b1';
  ids uuid[];
  added uuid;
begin
  select array_agg(id order by position desc) into ids from public.pipeline_stages where customer_id = a;
  perform public.reorder_stages(a, ids);
  assert (select array_agg(id order by position) from public.pipeline_stages where customer_id = a) = ids, 'admin reordered A''s columns';
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', b, ids)) = 'stage_not_found',
         'admin reordered A''s columns while acting for B';
  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (a, 'Referenser', cardinality(ids), 'open', 'pink') returning id into added;
  perform public.move_application('30000000-0000-0000-0000-0000000038a1', a, added);
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', '30000000-0000-0000-0000-0000000038a1', b, added))
         = 'card_not_found', 'admin moved A''s card while acting for B';
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', '30000000-0000-0000-0000-0000000038b1', b, added))
         = 'stage_not_found', 'admin moved B''s card into A''s column';
  raise notice 'OK 41: admin manages and moves into a customer''s columns only for that customer';
end $$;

-- Signed out: no columns, no reorder, no move by id. A deleted account sees none of its own.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  assert pg_temp.error_of(format('select public.reorder_stages(%L, %L)', '00000000-0000-0000-0000-0000000038a1', '{}'::uuid[]))
         = '42501', 'a signed-out user could call reorder_stages';
  assert pg_temp.error_of(format('select public.move_application(%L, %L, %L::uuid)', '30000000-0000-0000-0000-0000000038a1',
                                 '00000000-0000-0000-0000-0000000038a1', gen_random_uuid()))
         = '42501', 'a signed-out user could call move_application by id';
  reset role;
  update public.profiles set deleted_at = now() where id = '00000000-0000-0000-0000-0000000038b2';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000038b2","role":"authenticated"}', true);
  assert (select count(*) from public.pipeline_stages) = 0, 'a deleted member sees its company''s columns';
  reset role;
  raise notice 'OK 42: signed-out users cannot reorder or move by id, and a deleted account sees no columns';
end $$;

-- A client inserts and updates only the columns the app writes, and deleting a company takes its
-- columns along with its cards.
reset role;
do $$ declare actual text; begin
  select string_agg(privilege_type || ':' || cols, ' ' order by privilege_type) into actual
  from (
    select privilege_type, string_agg(column_name, ',' order by column_name) as cols
    from information_schema.role_column_grants
    where grantee = 'authenticated' and table_schema = 'public' and table_name = 'pipeline_stages'
      and privilege_type in ('INSERT', 'UPDATE')
    group by privilege_type
  ) grants;
  if actual is distinct from 'INSERT:colour,customer_id,kind,name,position UPDATE:colour,kind,name,position' then
    raise exception 'FAIL 43: pipeline_stages column grants are %', actual;
  end if;

  delete from public.companies where id = '00000000-0000-0000-0000-0000000038a1';
  assert not exists (select 1 from public.pipeline_stages where customer_id = '00000000-0000-0000-0000-0000000038a1'), 'columns left';
  assert not exists (select 1 from public.applications where customer_id = '00000000-0000-0000-0000-0000000038a1'), 'cards left';
  raise notice 'OK 43: clients write only the stage columns the app uses, and deleting a company removes its columns and cards';
end $$;

-- ---------------------------------------------------------------- removing an assessment (ATS-56)
-- A customer removes its own assessment and keeps the CV; another customer, a deleted account and
-- anon cannot. RLS is the check, the same rule as reading.
reset role;
do $$ declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_member uuid := gen_random_uuid();
  job uuid; cand uuid; app uuid;
begin
  perform pg_temp.add_customer(a, 'assess-a-56@test.local');
  perform pg_temp.add_member(a, a_member, 'assess-a2-56@test.local');
  perform pg_temp.add_customer(b, 'assess-b-56@test.local');
  insert into public.jobs (customer_id, title) values (a, 'Job 56') returning id into job;
  insert into public.candidates (customer_id, full_name, cv_path) values (a, 'With CV 56', a || '/x.pdf') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job, cand) returning id into app;
  insert into public.cv_assessments (application_id, score) values (app, 4), (app, 7);

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  delete from public.cv_assessments where application_id = app;
  reset role;
  assert (select count(*) from public.cv_assessments where application_id = app) = 2, 'B removed A''s assessments';

  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  begin
    delete from public.cv_assessments where application_id = app;
    raise exception 'FAIL 44: a signed-out user could delete assessments';
  exception when insufficient_privilege then null;
  end;
  reset role;

  update public.profiles set deleted_at = now() where id = a_member;
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a_member), true);
  delete from public.cv_assessments where application_id = app;
  reset role;
  assert (select count(*) from public.cv_assessments where application_id = app) = 2, 'a deleted member removed its assessments';
  update public.profiles set deleted_at = null where id = a_member;

  set local role authenticated;
  delete from public.cv_assessments where application_id = app;
  reset role;
  assert (select count(*) from public.cv_assessments where application_id = app) = 0, 'A could not remove its own assessments';
  assert (select cv_path from public.candidates where id = cand) = a || '/x.pdf', 'removing the assessments removed the CV';

  insert into public.cv_assessments (application_id, score) values (app, 5);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  delete from public.cv_assessments where application_id = app;
  reset role;
  assert (select count(*) from public.cv_assessments where application_id = app) = 0, 'admin could not remove a customer''s assessment';
  raise notice 'OK 44: a customer and an admin remove an assessment and keep the CV; another customer, a deleted account and anon cannot';
end $$;

-- ---------------------------------------------------------------- managing columns (ATS-40)
-- Companies A3 and B3; B3's second member signs in for it. pg_temp.error_of() and pg_temp.stage_of() are from the ATS-38 section.
reset role;
select pg_temp.add_customer('00000000-0000-0000-0000-0000000040a1', 'stages-a-40@test.local');
select pg_temp.add_customer('00000000-0000-0000-0000-0000000040b1', 'stages-b-40@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000040b1', '00000000-0000-0000-0000-0000000040b2', 'stages-b2-40@test.local');
insert into public.jobs (id, customer_id, title) values
  ('10000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040a1', 'Job A 40');

-- A new card lands in the first open column: after New is renamed, after the columns are
-- reordered, and after New is removed. Since ATS-42 that is an insert without a column, or with the
-- nil placeholder that is stage_id's default. A column of another customer is refused (23503).
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000040a1';
  job uuid := '10000000-0000-0000-0000-0000000040a1';
  ids uuid[];
  new_card uuid;
begin
  insert into public.candidates (customer_id, full_name) values (a, 'First 40') returning id into new_card;
  insert into public.applications (job_id, candidate_id, stage_id)
  values (job, new_card, '00000000-0000-0000-0000-000000000000');
  assert (select stage_id from public.applications where candidate_id = new_card) = pg_temp.stage_of(a, 'new'),
         'an insert with the nil placeholder did not land in New';

  update public.pipeline_stages set name = 'Inkommen' where id = pg_temp.stage_of(a, 'new');
  insert into public.candidates (customer_id, full_name) values (a, 'Second 40') returning id into new_card;
  insert into public.applications (job_id, candidate_id) values (job, new_card);
  assert (select stage_id from public.applications where candidate_id = new_card) = pg_temp.stage_of(a, 'new'),
         'after New was renamed, a new card did not land in it';

  -- Rejected first, then Screening: the first open column is Screening, never Rejected.
  select array_agg(id order by case default_key when 'rejected' then 0 when 'screening' then 1 else 2 end, position)
  into ids from public.pipeline_stages where customer_id = a;
  perform public.reorder_stages(a, ids);
  insert into public.candidates (customer_id, full_name) values (a, 'Third 40') returning id into new_card;
  insert into public.applications (job_id, candidate_id) values (job, new_card);
  assert (select stage_id from public.applications where candidate_id = new_card) = pg_temp.stage_of(a, 'screening'),
         'after a reorder, a new card did not land in the first open column';

  -- New can only go once it is empty.
  update public.applications set stage_id = pg_temp.stage_of(a, 'screening')
  where stage_id = pg_temp.stage_of(a, 'new');
  delete from public.pipeline_stages where id = pg_temp.stage_of(a, 'new');
  insert into public.candidates (customer_id, full_name) values (a, 'Fourth 40') returning id into new_card;
  insert into public.applications (job_id, candidate_id) values (job, new_card);
  assert (select stage_id from public.applications where candidate_id = new_card) = pg_temp.stage_of(a, 'screening'),
         'after New was removed, a new card did not land in the first open column';
  insert into public.candidates (customer_id, full_name) values (a, 'Fifth 40') returning id into new_card;
  assert pg_temp.error_of(format('insert into public.applications (job_id, candidate_id, stage_id) values (%L, %L, %L)',
           job, new_card, pg_temp.stage_of('00000000-0000-0000-0000-0000000040b1', 'new')))
         = '23503', 'a new card got another customer''s column';
  raise notice 'OK 45: a new card lands in the first open column after New is renamed, moved or removed, and never in another customer''s';
end $$;

-- At least one open column: removing the last one, or changing its kind, is refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040b2","role":"authenticated"}', true);
do $$ declare b uuid := '00000000-0000-0000-0000-0000000040b1'; begin
  delete from public.pipeline_stages where customer_id = b and default_key in ('new', 'screening', 'interview');
  assert pg_temp.error_of(format('delete from public.pipeline_stages where id = %L', pg_temp.stage_of(b, 'offer')))
         = 'stage_open_required', 'the last open column could be removed';
  assert pg_temp.error_of(format('update public.pipeline_stages set kind = ''rejected'' where id = %L', pg_temp.stage_of(b, 'offer')))
         = 'stage_open_required', 'the last open column could change kind';
  raise notice 'OK 46: the last open column cannot be removed or change kind (stage_open_required)';
end $$;

-- add_stage puts a new open column before the first Hired or Rejected column, and stops at 10.
-- B cannot add a column to A's board.
do $$ declare
  a uuid := '00000000-0000-0000-0000-0000000040a1';
  b uuid := '00000000-0000-0000-0000-0000000040b1';
  added public.pipeline_stages;
begin
  added := public.add_stage(b, 'Kodtest', 'teal');
  assert added.kind = 'open' and added.name = 'Kodtest' and added.default_key is null, 'the new column';
  assert (select string_agg(coalesce(default_key, name), ',' order by position) from public.pipeline_stages where customer_id = b)
         = 'offer,Kodtest,hired,rejected', 'the new column did not land before Hired';
  assert pg_temp.error_of(format('select public.add_stage(%L, ''Kodtest'', ''grey'')', b)) = '23505', 'a duplicate name was accepted';
  assert pg_temp.error_of(format('select public.add_stage(%L, ''Lila'', ''purple'')', b)) = '23514', 'a colour outside the palette was accepted';
  assert pg_temp.error_of(format('select public.add_stage(%L, ''Planterad'', ''grey'')', a)) = 'stage_not_found', 'B added a column for A';
  for i in 1..6 loop perform public.add_stage(b, 'Extra ' || i, 'grey'); end loop;
  assert pg_temp.error_of(format('select public.add_stage(%L, ''Elva'', ''grey'')', b)) = 'stage_limit_reached', 'an eleventh column was added';
  assert pg_temp.error_of(format('select public.reset_stages(%L)', a)) = 'stage_not_found', 'B reset A''s columns';
  reset role;
  assert not exists (select 1 from public.pipeline_stages where customer_id = a and name = 'Planterad'), 'B''s column reached A';
  raise notice 'OK 47: add_stage adds an open column before Hired, up to 10, and only to the caller''s own board';
end $$;

-- reset_stages at 10 columns, after removed and renamed defaults and an own Rejected column:
-- the six defaults are back, in order, with their keys, names, colours and kinds. The default
-- columns keep their ids, and their cards keep their column and stage_changed_at.
do $$ declare
  b uuid := '00000000-0000-0000-0000-0000000040b1';
  own_rejected uuid;
  offer_id uuid;
  card uuid;
  long_ago timestamptz := '2026-01-01';
begin
  insert into public.jobs (customer_id, title) values (b, 'Job B 40');
  insert into public.candidates (customer_id, full_name) values (b, 'Cand B 40');
  insert into public.applications (job_id, candidate_id, stage_id)
  select j.id, c.id, pg_temp.stage_of(b, 'offer')
  from public.jobs j, public.candidates c where j.customer_id = b and c.customer_id = b
  returning id into card;
  update public.applications set stage_changed_at = long_ago where id = card;
  offer_id := pg_temp.stage_of(b, 'offer');
  update public.pipeline_stages set name = 'Erbjudet', colour = 'pink' where id = offer_id;
  -- Replace the default Rejected with an own one: make room under the limit first.
  delete from public.pipeline_stages where customer_id = b and name = 'Extra 6';
  insert into public.pipeline_stages (customer_id, name, position, kind, colour)
  values (b, 'Nej tack', 20, 'rejected', 'red') returning id into own_rejected;
  delete from public.pipeline_stages where id = pg_temp.stage_of(b, 'rejected');
  insert into public.pipeline_stages (customer_id, name, position, kind, colour) values (b, 'Extra 7', 21, 'open', 'grey');
  assert (select count(*) from public.pipeline_stages where customer_id = b) = 10, 'ten columns before the reset';

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040b2","role":"authenticated"}', true);
  perform public.reset_stages(b);
  reset role;

  assert (select string_agg(default_key || ':' || kind || ':' || colour || ':' || position, ',' order by position)
          from public.pipeline_stages where customer_id = b)
         = 'new:open:grey:0,screening:open:blue:1,interview:open:violet:2,offer:open:amber:3,hired:hired:green:4,rejected:rejected:red:5',
         'the six defaults are not back in order';
  assert not exists (select 1 from public.pipeline_stages where customer_id = b and (name is not null or default_key is null)),
         'a renamed default kept its name, or an own column stayed';
  assert pg_temp.stage_of(b, 'offer') = offer_id, 'a default column got a new id';
  assert (select stage_id = offer_id and stage_changed_at = long_ago from public.applications where id = card),
         'a card moved or its days in stage restarted';
  raise notice 'OK 48: reset_stages brings back the six defaults at 10 columns, after removed, renamed and replaced defaults, and cards stay';
end $$;

-- A reset that would remove a column with cards changes nothing. The admin resets for a customer.
do $$ declare
  b uuid := '00000000-0000-0000-0000-0000000040b1';
  before text;
  added public.pipeline_stages;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040b2","role":"authenticated"}', true);
  added := public.add_stage(b, 'Referenser', 'teal');
  update public.pipeline_stages set name = 'Inkommen' where id = pg_temp.stage_of(b, 'new');
  update public.applications set stage_id = added.id where customer_id = b;
  select string_agg(id || coalesce(name, '') || colour || position, ',' order by position) into before
  from public.pipeline_stages where customer_id = b;
  assert pg_temp.error_of(format('select public.reset_stages(%L)', b)) = '23503',
         'a reset removed a column with cards';
  assert (select string_agg(id || coalesce(name, '') || colour || position, ',' order by position)
          from public.pipeline_stages where customer_id = b) = before, 'a refused reset changed something';

  update public.applications set stage_id = pg_temp.stage_of(b, 'new') where customer_id = b;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  perform public.reset_stages(b);
  reset role;
  assert (select count(*) from public.pipeline_stages where customer_id = b) = 6, 'the admin''s reset did not remove the own column';
  raise notice 'OK 49: a reset that would remove a column with cards changes nothing, and an admin resets for a customer';
end $$;

-- Signed out, and a deleted account, cannot add or reset.
do $$ declare b uuid := '00000000-0000-0000-0000-0000000040b1'; begin
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  assert pg_temp.error_of(format('select public.add_stage(%L, ''X'', ''grey'')', b)) = '42501', 'anon could call add_stage';
  assert pg_temp.error_of(format('select public.reset_stages(%L)', b)) = '42501', 'anon could call reset_stages';
  reset role;
  update public.profiles set deleted_at = now() where id = '00000000-0000-0000-0000-0000000040b2';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000040b2","role":"authenticated"}', true);
  assert pg_temp.error_of(format('select public.add_stage(%L, ''X'', ''grey'')', b)) = 'stage_not_found', 'a deleted member added a column';
  assert pg_temp.error_of(format('select public.reset_stages(%L)', b)) = 'stage_not_found', 'a deleted member reset its columns';
  reset role;
  raise notice 'OK 50: signed-out users and deleted members cannot add or reset columns';
end $$;

-- ---------------------------------------------------------------- companies (ATS-44)
-- No customer table, and not companies, references profiles or auth.users, so deleting a user can
-- never cascade to company data. Every customer_id references companies, on delete cascade.
reset role;
do $$ declare tbl text; bad text; begin
  select string_agg(conrelid::regclass::text || ' -> ' || confrelid::regclass::text, ', ') into bad
  from pg_constraint
  where contype = 'f'
    and conrelid in ('public.jobs'::regclass, 'public.candidates'::regclass, 'public.applications'::regclass,
                     'public.cv_assessments'::regclass, 'public.pipeline_stages'::regclass, 'public.companies'::regclass)
    and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass);
  if bad is not null then raise exception 'FAIL 51: a customer table references a user: %', bad; end if;
  foreach tbl in array array['jobs', 'candidates', 'applications', 'cv_assessments', 'pipeline_stages'] loop
    if not exists (
      select 1 from pg_constraint
      where contype = 'f' and conrelid = format('public.%I', tbl)::regclass
        and confrelid = 'public.companies'::regclass and confdeltype = 'c'
        and conkey = array[(select attnum from pg_attribute
                            where attrelid = format('public.%I', tbl)::regclass and attname = 'customer_id')]
    ) then
      raise exception 'FAIL 51: %.customer_id does not reference companies on delete cascade', tbl;
    end if;
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.companies'::regclass), 'companies without RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.company_members'::regclass), 'company_members without RLS';
  assert exists (select 1 from pg_constraint where conrelid = 'public.company_members'::regclass
                 and contype = 'u' and conname = 'company_members_user_id_key'), 'a user can be in two companies';
  raise notice 'OK 51: every customer_id references companies on delete cascade, and no customer table or companies references a user';
end $$;

-- Companies E and F. E's first user (id = company id, the shape main reads with) and its second
-- member share every row; F sees none of them, nor E's CVs, columns, company or members. Members of
-- a deleted company see nothing.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  f uuid := '00000000-0000-0000-0000-0000000044f1';
  job uuid; cand uuid; who uuid;
begin
  perform pg_temp.add_customer(e, 'company-e-44@test.local');
  perform pg_temp.add_member(e, e2, 'company-e2-44@test.local');
  perform pg_temp.add_customer(f, 'company-f-44@test.local');
  insert into storage.objects (bucket_id, name) values ('cvs', e || '/e.pdf');

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', e2), true);
  insert into public.jobs (customer_id, title) values (e, 'Job E') returning id into job;
  insert into public.candidates (customer_id, full_name, cv_path) values (e, 'Cand E', e || '/e.pdf') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job, cand);

  foreach who in array array[e, e2] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert (select count(*) from public.jobs) = 1, 'a member of E does not see its job';
    assert (select count(*) from public.candidates) = 1, 'a member of E does not see its candidate';
    assert (select count(*) from public.applications) = 1, 'a member of E does not see its card';
    assert (select count(*) from public.pipeline_stages) = 6, 'a member of E does not see its columns';
    assert (select count(*) from storage.objects where bucket_id = 'cvs') = 1, 'a member of E does not see its CV';
    assert (select array_agg(id) from public.companies) = array[e], 'a member of E sees another company, or not its own';
    assert (select count(*) from public.company_members where company_id = e) = 2, 'a member of E does not see E''s members';
    assert public.current_company_id() = e, 'current_company_id() is not E';
  end loop;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', f), true);
  assert not exists (select 1 from public.jobs where customer_id = e), 'F sees E''s jobs';
  assert not exists (select 1 from public.candidates where customer_id = e), 'F sees E''s candidates';
  assert not exists (select 1 from public.applications where customer_id = e), 'F sees E''s cards';
  assert not exists (select 1 from public.pipeline_stages where customer_id = e), 'F sees E''s columns';
  assert not exists (select 1 from storage.objects where bucket_id = 'cvs' and name like e || '/%'), 'F sees E''s CVs';
  assert not exists (select 1 from public.companies where id = e), 'F sees company E';
  assert not exists (select 1 from public.company_members where company_id = e), 'F sees E''s members';

  reset role;
  update public.companies set deleted_at = now() where id = e;
  set local role authenticated;
  foreach who in array array[e, e2] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert public.current_company_id() is null, 'a member of a deleted company has a company';
    assert (select count(*) from public.jobs) = 0, 'a member of a deleted company sees its jobs';
    assert (select count(*) from public.companies) = 0, 'a member of a deleted company sees it';
    assert (select count(*) from storage.objects where bucket_id = 'cvs') = 0, 'a member of a deleted company sees its CVs';
  end loop;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  assert exists (select 1 from public.companies where id = e and deleted_at is not null), 'the admin does not see the deleted company';
  assert exists (select 1 from public.jobs where id = job), 'the admin does not see the deleted company''s data';
  reset role;
  update public.companies set deleted_at = null where id = e;
  raise notice 'OK 52: two members of a company share its rows, CVs and columns, another company sees none of them, and members of a deleted company see nothing';
end $$;

-- A client cannot join, leave or switch a company, or rename or delete one, not even an admin's
-- token: those go through the admin Edge Functions (ATS-46). An admin is never a member: the
-- service role cannot add one, and a member promoted to admin leaves its company, which keeps
-- its data.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  f uuid := '00000000-0000-0000-0000-0000000044f1';
  who uuid;
begin
  foreach who in array array[f, '00000000-0000-0000-0000-0000000000ad'::uuid] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)', e, f))
           = '42501', 'a client joined a company';
    assert pg_temp.error_of(format('delete from public.company_members where user_id = %L', f)) = '42501',
           'a client left a company';
    assert pg_temp.error_of(format('update public.company_members set company_id = %L where user_id = %L', e, f))
           = '42501', 'a client switched company';
    assert pg_temp.error_of(format('insert into public.companies (name) values (%L)', 'Planted')) = '42501',
           'a client created a company';
    assert pg_temp.error_of(format('update public.companies set name = %L where id = %L', 'Renamed', e)) = '42501',
           'a client renamed a company';
    assert pg_temp.error_of(format('delete from public.companies where id = %L', e)) = '42501',
           'a client deleted a company';
    reset role;
  end loop;
  assert (select company_id from public.company_members where user_id = f) = f, 'F''s membership changed';
  assert (select name from public.companies where id = e) = 'Company company-e-44@test.local', 'E was renamed';

  set local role service_role;
  assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)',
                                 e, '00000000-0000-0000-0000-0000000000ad'))
         = 'admin_cannot_be_member', 'an admin became a member';
  assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)', e, f))
         = '23505', 'a user joined a second company';
  reset role;

  update auth.users set raw_app_meta_data = '{"role":"admin"}' where id = e2;
  assert not exists (select 1 from public.company_members where user_id = e2), 'a member promoted to admin kept its membership';
  assert (select count(*) from public.jobs where customer_id = e) = 1, 'promoting a member removed company data';
  update auth.users set raw_app_meta_data = '{"role":"customer"}' where id = e2;
  insert into public.company_members (company_id, user_id) values (e, e2);
  raise notice 'OK 53: no client joins, leaves, switches, renames or deletes a company, an admin is never a member, and a user has one company';
end $$;

-- The card triggers run in the order their names give: customer_id from the job first, then the
-- first open column of that customer. customer_id's placeholder is the nil UUID, which an insert
-- by anyone whose id is not a company, here the admin, needs.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1';
  job uuid; cand uuid; card public.applications;
begin
  assert (select array_agg(tgname::text order by tgname) from pg_trigger
          where tgrelid = 'public.applications'::regclass and not tgisinternal
            and tgtype & 2 = 2 and tgtype & 4 = 4)
         = array['applications_1_set_customer', 'applications_2_start_stage'],
         'the before-insert card triggers are not the two named ones';
  assert (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'applications' and column_name = 'customer_id')
         = '''00000000-0000-0000-0000-000000000000''::uuid', 'customer_id''s placeholder is not the nil UUID';

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  insert into public.jobs (customer_id, title) values (e, 'Job E2') returning id into job;
  insert into public.candidates (customer_id, full_name) values (e, 'Cand E2') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job, cand) returning * into card;
  reset role;
  assert card.customer_id = e, 'the card did not get the job''s company';
  assert card.stage_id = pg_temp.stage_of(e, 'new'), 'the card did not land in the company''s first open column';
  raise notice 'OK 54: the card triggers run in their named order, and customer_id''s placeholder is the nil UUID';
end $$;

-- A row's owner never changes once written (AC12): not by a customer, an admin or the service role.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  f uuid := '00000000-0000-0000-0000-0000000044f1';
  job uuid; cand uuid; tbl text; row_id uuid; who text; message text;
begin
  select id into job from public.jobs where customer_id = e limit 1;
  select id into cand from public.candidates where customer_id = e limit 1;
  foreach who in array array[e2::text, '00000000-0000-0000-0000-0000000000ad', 'service_role'] loop
    foreach tbl in array array['jobs', 'candidates'] loop
      row_id := case tbl when 'jobs' then job else cand end;
      if who = 'service_role' then
        set local role service_role;
      else
        set local role authenticated;
        perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
      end if;
      message := null;
      begin
        execute format('update public.%I set customer_id = %L where id = %L', tbl, f, row_id);
      exception when insufficient_privilege then message := sqlerrm;
      end;
      reset role;
      if message is distinct from 'owner_change_not_allowed' then
        raise exception 'FAIL 55: % moved a row of % to another company (got %)', who, tbl, coalesce(message, 'no error');
      end if;
    end loop;
  end loop;
  assert (select customer_id from public.jobs where id = job) = e, 'the job changed owner';
  assert (select customer_id from public.candidates where id = cand) = e, 'the candidate changed owner';
  update public.jobs set customer_id = e, title = 'Job E kept' where id = job;
  raise notice 'OK 55: no customer, admin or service role changes the owner of a job or a candidate';
end $$;

-- Until company_name is dropped, the first user's profile names and deletes the company, the way
-- main's accounts page changes them. A new company gets the six default columns, a new user none.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  added uuid; lone uuid := gen_random_uuid();
begin
  update public.profiles set company_name = '  Bolaget E  ' where id = e;
  assert (select name from public.companies where id = e) = 'Bolaget E', 'the company did not follow its first user''s name';
  update public.profiles set company_name = '' where id = e;
  assert (select name from public.companies where id = e) = 'Bolaget E', 'a blank company_name cleared the company''s name';
  update public.profiles set company_name = 'Ignored' where id = e2;
  assert (select name from public.companies where id = e) = 'Bolaget E', 'a second member renamed the company';

  update public.profiles set deleted_at = now() where id = e;
  assert (select deleted_at is not null from public.companies where id = e), 'deleting the first user did not delete the company';
  update public.profiles set deleted_at = null where id = e;
  assert (select deleted_at is null from public.companies where id = e), 'restoring the first user did not restore the company';
  update public.profiles set deleted_at = now() where id = e2;
  assert (select deleted_at is null from public.companies where id = e), 'deleting a second member deleted the company';
  update public.profiles set deleted_at = null where id = e2;

  insert into auth.users (id, email, raw_app_meta_data) values (lone, 'lone-44@test.local', '{"role":"customer"}');
  assert not exists (select 1 from public.pipeline_stages where customer_id = lone), 'a new user got columns';
  assert not exists (select 1 from public.company_members where user_id = lone), 'a new user got a company';
  insert into public.companies (name) values ('Nytt bolag') returning id into added;
  assert added <> lone, 'a new company took a user''s id';
  assert (select count(*) from public.pipeline_stages where customer_id = added and default_key is not null) = 6,
         'a new company did not get the six default columns';
  assert pg_temp.error_of(format('insert into public.companies (name) values (%L)', repeat('x', 201))) = '23514',
         'a company name over 200 characters was accepted';
  assert pg_temp.error_of('insert into public.companies (name) values (''  '')') = '23514', 'a blank company name was accepted';
  raise notice 'OK 56: the first user''s profile names, deletes and restores its company, a new company gets the six columns, and a new user none';
end $$;

rollback;
