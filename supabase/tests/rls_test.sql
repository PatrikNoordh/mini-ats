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

-- A customer: a company and its first member. No account shares an id with a company (ATS-61),
-- so the first member's id is first_user(<company id>): the company's id with 1000 as its fourth
-- group, which keeps the checks readable. add_customer() returns the company's id. add_member()
-- adds another user to a company. No user id equals a company id, so a rule that still compares
-- customer_id with auth.uid() fails every customer check. Both run as the table owner, past RLS.
create function pg_temp.first_user(company uuid) returns uuid
language sql immutable as $$
  select overlay(company::text placing '1' from 20 for 1)::uuid;
$$;

create function pg_temp.add_customer(new_id uuid, new_email text) returns uuid
language plpgsql as $$
begin
  insert into public.companies (id, name) values (new_id, 'Company ' || new_email);
  insert into auth.users (id, email, raw_app_meta_data)
  values (pg_temp.first_user(new_id), new_email, '{"role":"customer"}');
  insert into public.company_members (company_id, user_id) values (new_id, pg_temp.first_user(new_id));
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
  ('00000000-0000-0000-1000-0000000000a1', 'a@test.local',     '{"role":"customer"}', '{"full_name":"A"}'),
  ('00000000-0000-0000-1000-0000000000b1', 'b@test.local',     '{}', '{"full_name":"B"}');

-- Companies A (…0a1) and B (…0b1), their first users above, and a second member each: a2 and b2.
-- The customer checks sign in as the second member.
insert into public.companies (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Company A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Company B');
insert into public.company_members (company_id, user_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-1000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-1000-0000000000b1');
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
  assert (select role from public.profiles where id = '00000000-0000-0000-1000-0000000000b1') = 'customer', 'default role';
  assert (select email from public.profiles where id = '00000000-0000-0000-1000-0000000000a1') = 'a@test.local', 'email copied';
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
          ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-1000-0000000000a1',
           '00000000-0000-0000-1000-0000000000b1')) = 3,
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

-- Deleting company A's first user keeps everything the company owns:
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

  delete from auth.users where id = pg_temp.first_user(a);
  assert not exists (select 1 from public.company_members where user_id = pg_temp.first_user(a)),
         'the first user''s membership stayed';
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
  'applications:DELETE,INSERT,SELECT,UPDATE audit_events:SELECT candidates:DELETE,INSERT,SELECT,UPDATE companies:SELECT '
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
  first uuid := pg_temp.first_user(customer);
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
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', first), true);
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
  -- purge-deleted-accounts function, ATS-17), a company's first user too since the purge removes
  -- only the login (ATS-46). Deleting a member's user leaves the company's data.
  update public.profiles set deleted_at = now() - interval '29 days' where id = member;
  update public.profiles set deleted_at = now() - interval '31 days' where id in (admin2, first);
  assert admin2 in (select public.accounts_due_for_purge()), 'deleted 31 days ago: due';
  assert member not in (select public.accounts_due_for_purge()), 'deleted 29 days ago: not due';
  assert first in (select public.accounts_due_for_purge()), 'a company''s first user deleted 31 days ago: not due';
  update public.profiles set deleted_at = now() - interval '31 days' where id = member;
  assert member in (select public.accounts_due_for_purge()), 'a member deleted 31 days ago: due';
  assert '00000000-0000-0000-0000-0000000000ad' not in (select public.accounts_due_for_purge()), 'active admin not due';
  assert not has_function_privilege('anon', 'public.accounts_due_for_purge()', 'execute'), 'anon cannot list';
  assert not has_function_privilege('authenticated', 'public.accounts_due_for_purge()', 'execute'), 'no client can list';
  assert to_regprocedure('public.purge_deleted_accounts()') is null, 'the SQL purge is gone';
  delete from auth.users where id = member;
  assert exists (select 1 from public.jobs where id = job), 'deleting a member removed the company''s jobs';
  raise notice 'OK 28: only accounts deleted more than 30 days ago are due for the purge, a company''s first user too, and no client can list them';
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
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(other)), true);
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
  update public.profiles set deleted_at = now() where id = pg_temp.first_user(gone);
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(gone)), true);
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
  update public.profiles set deleted_at = now() where id = pg_temp.first_user(cv_gone);

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

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(cv_gone)), true);
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
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(b)), true);
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
-- No customer table, not companies and not the audit log references profiles or auth.users, so
-- deleting a user can never cascade to company data or its history. Every customer_id references
-- companies, on delete cascade.
reset role;
do $$ declare tbl text; bad text; begin
  select string_agg(conrelid::regclass::text || ' -> ' || confrelid::regclass::text, ', ') into bad
  from pg_constraint
  where contype = 'f'
    and conrelid in ('public.jobs'::regclass, 'public.candidates'::regclass, 'public.applications'::regclass,
                     'public.cv_assessments'::regclass, 'public.pipeline_stages'::regclass, 'public.companies'::regclass,
                     'public.audit_events'::regclass)
    and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass);
  if bad is not null then raise exception 'FAIL 51: a customer table references a user: %', bad; end if;
  foreach tbl in array array['jobs', 'candidates', 'applications', 'cv_assessments', 'pipeline_stages', 'audit_events'] loop
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

-- Companies E and F. E's first user and its second member share every row; F sees none of them,
-- nor E's CVs, columns, company or members. Members of a deleted company see nothing.
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

  foreach who in array array[pg_temp.first_user(e), e2] loop
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

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(f)), true);
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
  foreach who in array array[pg_temp.first_user(e), e2] loop
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
  f uuid := '00000000-0000-0000-0000-0000000044f1'; f1 uuid := pg_temp.first_user(f);
  who uuid;
begin
  foreach who in array array[f1, '00000000-0000-0000-0000-0000000000ad'::uuid] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)', e, f1))
           = '42501', 'a client joined a company';
    assert pg_temp.error_of(format('delete from public.company_members where user_id = %L', f1)) = '42501',
           'a client left a company';
    assert pg_temp.error_of(format('update public.company_members set company_id = %L where user_id = %L', e, f1))
           = '42501', 'a client switched company';
    assert pg_temp.error_of(format('insert into public.companies (name) values (%L)', 'Planted')) = '42501',
           'a client created a company';
    assert pg_temp.error_of(format('update public.companies set name = %L where id = %L', 'Renamed', e)) = '42501',
           'a client renamed a company';
    assert pg_temp.error_of(format('delete from public.companies where id = %L', e)) = '42501',
           'a client deleted a company';
    reset role;
  end loop;
  assert (select company_id from public.company_members where user_id = f1) = f, 'F''s membership changed';
  assert (select name from public.companies where id = e) = 'Company company-e-44@test.local', 'E was renamed';

  set local role service_role;
  assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)',
                                 e, '00000000-0000-0000-0000-0000000000ad'))
         = 'admin_cannot_be_member', 'an admin became a member';
  assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)', e, f1))
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

-- A row's owner never changes once written (ATS-44 AC12, ATS-61 AC1): not by a customer, an admin
-- or the service role, on a job, a candidate, a card or an assessment. A card or an assessment
-- moved to a row of another company, which would give it that company's customer_id through
-- the triggers, is refused too. Clients have no update grant on assessments at all.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  f uuid := '00000000-0000-0000-0000-0000000044f1';
  job uuid; cand uuid; card uuid; assessment uuid; f_job uuid; f_cand uuid; f_card uuid;
  tbl text; row_id uuid; who text; statement text; code text;
begin
  select id into job from public.jobs where customer_id = e limit 1;
  select id into cand from public.candidates where customer_id = e limit 1;
  select id into card from public.applications where customer_id = e limit 1;
  insert into public.cv_assessments (application_id, score) values (card, 6) returning id into assessment;
  insert into public.jobs (customer_id, title) values (f, 'Job F 55') returning id into f_job;
  insert into public.candidates (customer_id, full_name) values (f, 'Cand F 55') returning id into f_cand;
  insert into public.applications (job_id, candidate_id) values (f_job, f_cand) returning id into f_card;

  foreach who in array array[e2::text, '00000000-0000-0000-0000-0000000000ad', 'service_role'] loop
    foreach tbl in array array['jobs', 'candidates', 'applications', 'cv_assessments'] loop
      row_id := case tbl when 'jobs' then job when 'candidates' then cand when 'applications' then card else assessment end;
      foreach statement in array array[
        format('update public.%I set customer_id = %L where id = %L', tbl, f, row_id),
        case tbl
          when 'applications' then format('update public.applications set job_id = %L, candidate_id = %L where id = %L', f_job, f_cand, card)
          when 'cv_assessments' then format('update public.cv_assessments set application_id = %L where id = %L', f_card, assessment)
        end
      ] loop
        continue when statement is null;
        if who = 'service_role' then
          set local role service_role;
        else
          set local role authenticated;
          perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
        end if;
        -- The lock raises 42501 with its own message; a client's update of an assessment stops at
        -- the grants first, with 42501 and Postgres's message.
        begin
          execute statement;
          code := null;
        exception when others then
          code := case when sqlerrm = 'owner_change_not_allowed' then sqlerrm else sqlstate end;
        end;
        reset role;
        if code is distinct from 'owner_change_not_allowed'
           and not (tbl = 'cv_assessments' and who <> 'service_role' and code = '42501') then
          raise exception 'FAIL 55: % moved a row of % to another company (got %)', who, tbl, coalesce(code, 'no error');
        end if;
      end loop;
    end loop;
  end loop;
  assert (select customer_id from public.jobs where id = job) = e, 'the job changed owner';
  assert (select customer_id from public.candidates where id = cand) = e, 'the candidate changed owner';
  assert (select (customer_id, job_id) from public.applications where id = card) = (e, job), 'the card changed owner';
  assert (select (customer_id, application_id) from public.cv_assessments where id = assessment) = (e, card),
         'the assessment changed owner';
  assert (select array_agg(tgname::text order by tgname) from pg_trigger
          where tgrelid in ('public.applications'::regclass, 'public.cv_assessments'::regclass)
            and tgname like '%keep_customer')
         = array['applications_3_keep_customer', 'cv_assessments_2_keep_customer'],
         'the owner locks on cards and assessments are not the two named ones';

  -- The same company, or the same customer_id written back, is still an update like any other.
  update public.jobs set customer_id = e, title = 'Job E kept' where id = job;
  set local role service_role;
  update public.applications set customer_id = e where id = card;
  update public.cv_assessments set score = 7 where id = assessment;
  reset role;
  delete from public.cv_assessments where id = assessment;
  delete from public.applications where id = f_card;
  raise notice 'OK 55: no customer, admin or service role changes the owner of a job, a candidate, a card or an assessment';
end $$;

-- Deleting or restoring a user never deletes or restores a company (ATS-46). A new company gets
-- the six default columns, a new user none. profiles.company_name is gone (ATS-61): a new user's
-- profile is made without it, and only a role change reaches the company, by removing an admin's
-- membership (check 53).
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000044e1'; e1 uuid := pg_temp.first_user(e);
  e2 uuid := '00000000-0000-0000-0000-0000000044e2';
  added uuid; lone uuid := gen_random_uuid();
begin
  update public.profiles set deleted_at = now() where id = e1;
  assert (select deleted_at is null from public.companies where id = e), 'deleting the first user deleted the company';
  update public.companies set deleted_at = now() where id = e;
  update public.profiles set deleted_at = null where id = e1;
  assert (select deleted_at is not null from public.companies where id = e), 'restoring the first user restored the company';
  update public.companies set deleted_at = null where id = e;
  update public.profiles set deleted_at = now() where id = e2;
  assert (select deleted_at is null from public.companies where id = e), 'deleting a second member deleted the company';
  update public.profiles set deleted_at = null where id = e2;

  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (lone, 'lone-44@test.local', '{"role":"customer"}', '{"full_name":"Lone","company_name":"Ignored AB"}');
  assert (select full_name from public.profiles where id = lone) = 'Lone', 'a new user got no profile';
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'company_name'),
         'profiles.company_name is still there';
  assert (select pg_get_triggerdef(oid) from pg_trigger
          where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_sync_company')
         like '%AFTER UPDATE OF role ON public.profiles%', 'profiles_sync_company fires on more than a role change';
  assert not exists (select 1 from public.pipeline_stages where customer_id = lone), 'a new user got columns';
  assert not exists (select 1 from public.company_members where user_id = lone), 'a new user got a company';
  insert into public.companies (name) values ('Nytt bolag') returning id into added;
  assert added <> lone, 'a new company took a user''s id';
  assert (select count(*) from public.pipeline_stages where customer_id = added and default_key is not null) = 6,
         'a new company did not get the six default columns';
  assert pg_temp.error_of(format('insert into public.companies (name) values (%L)', repeat('x', 201))) = '23514',
         'a company name over 200 characters was accepted';
  assert pg_temp.error_of('insert into public.companies (name) values (''  '')') = '23514', 'a blank company name was accepted';
  raise notice 'OK 56: deleting or restoring a user never deletes or restores its company, a new company gets the six columns, a new user none, and profiles has no company_name';
end $$;

-- 57. A company deleted more than 30 days ago is due for the company purge (ATS-46), which no
-- client may run. Deleting a company hides it and its data from every member at once; deleting
-- it for good removes its data and keeps its users, whose logins the purge deletes separately.
reset role;
do $$ declare
  f uuid := pg_temp.add_customer('00000000-0000-0000-0000-0000000046f1', 'f1-46@test.local');
  f2 uuid := pg_temp.add_member('00000000-0000-0000-0000-0000000046f1', '00000000-0000-0000-0000-0000000046f2', 'f2-46@test.local');
  g uuid := pg_temp.add_customer('00000000-0000-0000-0000-0000000046a1', 'g1-46@test.local');
  job uuid;
begin
  insert into public.jobs (customer_id, title) values (f, 'Jobb F') returning id into job;
  assert f not in (select public.companies_due_for_purge()), 'an active company is due';

  update public.companies set deleted_at = now() - interval '29 days' where id = f;
  update public.companies set deleted_at = now() - interval '31 days' where id = g;
  assert f not in (select public.companies_due_for_purge()), 'a company deleted 29 days ago is due';
  assert g in (select public.companies_due_for_purge()), 'a company deleted 31 days ago is not due';
  assert pg_temp.first_user(f) not in (select public.accounts_due_for_purge()) and f2 not in (select public.accounts_due_for_purge()),
         'the members of a deleted company are due as accounts';
  assert not has_function_privilege('anon', 'public.companies_due_for_purge()', 'execute'), 'anon can list companies due';
  assert not has_function_privilege('authenticated', 'public.companies_due_for_purge()', 'execute'), 'a client can list companies due';

  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert public.current_company_id() is null, 'a member of a deleted company still has it';
  assert not exists (select 1 from public.jobs where id = job), 'a member of a deleted company sees its job';
  assert not exists (select 1 from public.companies where id = f), 'a member of a deleted company sees it';
  reset role;

  delete from public.companies where id = f;
  assert not exists (select 1 from public.jobs where id = job), 'deleting a company kept its job';
  assert exists (select 1 from public.profiles where id = f2), 'deleting a company deleted a member''s profile';
  assert not exists (select 1 from public.company_members where user_id in (pg_temp.first_user(f), f2)), 'a deleted company kept members';
  raise notice 'OK 57: a company deleted more than 30 days ago is due for the purge, no client can list it, its members see nothing once it is deleted, and its delete keeps their logins';
end $$;


-- 58. No customer table, and not companies, references a user, so deleting a login never reaches
-- company data. company_data_user_references() lists every foreign key that would let it. It was
-- the login swap's safety check (ATS-58), kept as this guard when the swap was retired (ATS-61) and
-- renamed after it (ATS-63). Only the service role may run it.
reset role;
do $$ begin
  assert not exists (select 1 from public.company_data_user_references()), 'a customer table references a user';
  alter table public.jobs add column guard_test_owner uuid
    constraint jobs_guard_test_owner_fkey references public.profiles (id);
  assert exists (select 1 from public.company_data_user_references()
                 where table_name = 'jobs' and constraint_name = 'jobs_guard_test_owner_fkey'),
         'a job referencing a profile is not listed';
  alter table public.jobs drop column guard_test_owner;
  alter table public.companies add column guard_test_user uuid
    constraint companies_guard_test_user_fkey references auth.users (id);
  assert exists (select 1 from public.company_data_user_references() where table_name = 'companies'),
         'a company referencing an Auth user is not listed';
  alter table public.companies drop column guard_test_user;
  assert not exists (select 1 from public.company_data_user_references()), 'a dropped reference is still listed';
  assert not has_function_privilege('anon', 'public.company_data_user_references()', 'execute'), 'anon can run the check';
  assert not has_function_privilege('authenticated', 'public.company_data_user_references()', 'execute'), 'a client can run the check';
  assert not exists (select 1 from pg_proc where proname = 'login_swap_blockers'), 'the old name is still there';
  raise notice 'OK 58: every foreign key from a customer table or companies to a user is listed, and only the service role may list them';
end $$;

-- 59. A login is deleted, never its company (ATS-58, reworded when the swap was retired in ATS-61).
-- Company S's first login uploaded the CV and is then deleted, as "delete for good" and the purge
-- do. A new login and the second member keep sharing every row, CV and column; company T's member
-- sees none of them.
reset role;
do $$ declare
  s uuid := '00000000-0000-0000-0000-0000000058a1'; s1 uuid := pg_temp.first_user(s);
  s2 uuid := '00000000-0000-0000-0000-0000000058a2'; s_new uuid := '00000000-0000-0000-0000-0000000058a3';
  t uuid := '00000000-0000-0000-0000-0000000058b1';
  job uuid; cand uuid; who uuid;
begin
  perform pg_temp.add_customer(s, 'first-58s@test.local');
  perform pg_temp.add_member(s, s2, 'second-58s@test.local');
  perform pg_temp.add_customer(t, 'first-58t@test.local');
  insert into public.jobs (customer_id, title) values (s, 'Job S') returning id into job;
  insert into public.candidates (customer_id, full_name, cv_path) values (s, 'Cand S', s || '/s.pdf') returning id into cand;
  insert into public.applications (job_id, candidate_id) values (job, cand);
  insert into storage.objects (bucket_id, name, owner) values ('cvs', s || '/s.pdf', s1);
  insert into public.jobs (customer_id, title) values (t, 'Job T');

  delete from auth.users where id = s1;
  perform pg_temp.add_member(s, s_new, 'new-58s@test.local');
  assert exists (select 1 from public.jobs where id = job) and exists (select 1 from public.candidates where id = cand and cv_path = s || '/s.pdf'),
         'deleting a login lost company data';
  assert exists (select 1 from storage.objects where name = s || '/s.pdf'), 'deleting a login lost the CV it uploaded';

  set local role authenticated;
  foreach who in array array[s_new, s2] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert public.current_company_id() = s, 'a member of S is not in S';
    assert (select array_agg(customer_id) from public.jobs) = array[s], 'a member of S does not see only S''s job';
    assert (select count(*) from public.candidates where cv_path is not null) = 1, 'a member of S does not see its candidate';
    assert (select count(*) from public.applications) = 1, 'a member of S does not see its card';
    assert (select count(*) from public.pipeline_stages) = 6, 'a member of S does not see its columns';
    assert (select count(*) from storage.objects where bucket_id = 'cvs' and name like s || '/%') = 1, 'a member of S does not see its CV';
  end loop;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.first_user(t)), true);
  assert (select array_agg(customer_id) from public.jobs) = array[t], 'T sees S''s jobs, or not its own';
  assert not exists (select 1 from public.candidates where customer_id = s), 'T sees S''s candidates';
  assert not exists (select 1 from storage.objects where bucket_id = 'cvs' and name like s || '/%'), 'T sees S''s CVs';
  assert not exists (select 1 from public.pipeline_stages where customer_id = s), 'T sees S''s columns';
  reset role;
  raise notice 'OK 59: deleting a login keeps its company''s rows and the CVs it uploaded, the other members share them, and another company sees none of them';
end $$;

-- 60. One id, one meaning (ATS-61): a company cannot take an account's id, and an account cannot
-- take a company's, not even with the service role.
reset role;
do $$ declare
  s uuid := '00000000-0000-0000-0000-0000000058a1';
  s2 uuid := '00000000-0000-0000-0000-0000000058a2';
  account uuid := '00000000-0000-0000-0000-0000000061a1';
begin
  set local role service_role;
  assert pg_temp.error_of(format('insert into public.companies (id, name) values (%L, %L)', s2, 'Bolag 60')) = '23505',
         'a company took an account''s id';
  assert pg_temp.error_of(format('update public.companies set id = %L where id = %L', s2, s)) = '23505',
         'a company changed its id to an account''s';
  reset role;
  assert pg_temp.error_of(format('insert into auth.users (id, email) values (%L, %L)', s, 'shared-60@test.local')) = '23505',
         'an account took a company''s id';
  insert into auth.users (id, email) values (account, 'own-60@test.local');
  assert pg_temp.error_of(format('update public.profiles set id = %L where id = %L', s, account)) = '23505',
         'an account changed its id to a company''s';
  assert not exists (select 1 from public.companies c join public.profiles p on p.id = c.id),
         'a company shares its id with an account';
  begin
    insert into public.companies (id, name) values (s2, 'Bolag 60');
  exception when unique_violation then
    if sqlerrm <> 'id_shared' then raise; end if;
  end;
  raise notice 'OK 60: no company takes an account''s id, and no account a company''s';
end $$;

-- 61. Nobody joins or moves into a deleted company, not even with the service role (ATS-61 AC7).
-- check_company_member() locks the account and the company before it checks them; the races it
-- closes run in membership_concurrency.sh.
reset role;
do $$ declare
  s uuid := '00000000-0000-0000-0000-0000000058a1';
  s2 uuid := '00000000-0000-0000-0000-0000000058a2';
  t uuid := '00000000-0000-0000-0000-0000000058b1';
  joiner uuid := '00000000-0000-0000-0000-0000000061b1';
begin
  insert into auth.users (id, email, raw_app_meta_data) values (joiner, 'joiner-61@test.local', '{"role":"customer"}');
  update public.companies set deleted_at = now() where id = t;
  set local role service_role;
  assert pg_temp.error_of(format('insert into public.company_members (company_id, user_id) values (%L, %L)', t, joiner))
         = 'company_deleted', 'a user joined a deleted company';
  assert pg_temp.error_of(format('update public.company_members set company_id = %L where user_id = %L', t, s2))
         = 'company_deleted', 'a member moved into a deleted company';
  insert into public.company_members (company_id, user_id) values (s, joiner);
  reset role;
  assert (select company_id from public.company_members where user_id = s2) = s, 'the refused move changed the membership';
  update public.companies set deleted_at = null where id = t;
  raise notice 'OK 61: nobody joins or moves into a deleted company';
end $$;

-- ---------------------------------------------------------------- audit log (ATS-47)
-- Companies E and F, each with a second member who signs in for it. Their rows are written by the
-- members, the admin and the service role, so the events below are the only ones they have.
reset role;
select pg_temp.add_customer('00000000-0000-0000-0000-0000000047e1', 'audit-e-47@test.local');
select pg_temp.add_customer('00000000-0000-0000-0000-0000000047f1', 'audit-f-47@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000047e1', '00000000-0000-0000-0000-0000000047e2', 'audit-e2-47@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000047f1', '00000000-0000-0000-0000-0000000047f2', 'audit-f2-47@test.local');

-- 62. The triggers write one event per insert, update and delete on jobs, candidates and cards,
-- with the row's customer and the caller as actor. An update that changes no tracked column
-- writes none. A job and a card keep their small values; a candidate keeps only the names of the
-- fields that changed, never a value. A deleted candidate's events stay.
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000047e1';
  e2 uuid := '00000000-0000-0000-0000-0000000047e2';
  admin uuid := '00000000-0000-0000-0000-0000000000ad';
  job uuid; other_job uuid; cand uuid; card uuid; other_card uuid;
  first_open uuid := pg_temp.stage_of('00000000-0000-0000-0000-0000000047e1', 'new');
  offer uuid := pg_temp.stage_of('00000000-0000-0000-0000-0000000047e1', 'offer');
  ev public.audit_events;
  log text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', e2), true);
  insert into public.jobs (customer_id, title, description, location)
  values (e, 'Job E', 'A long description', 'Malmö') returning id into job;
  insert into public.jobs (customer_id, title) values (e, 'Other job E') returning id into other_job;
  update public.jobs set title = 'Job E, renamed', description = 'Another description' where id = job;
  update public.jobs set title = title where id = job;
  insert into public.candidates (customer_id, full_name, email, notes)
  values (e, 'Secret Name', 'secret@test.local', 'Secret note') returning id into cand;
  update public.candidates set email = 'other-secret@test.local', notes = 'Other secret note' where id = cand;
  insert into public.applications (job_id, candidate_id) values (job, cand) returning id into card;
  insert into public.applications (job_id, candidate_id) values (other_job, cand) returning id into other_card;
  perform public.move_application(card, e, offer);
  update public.applications set position = position + 1 where id = card;
  delete from public.applications where id = other_card;

  reset role;
  assert (select count(*) from public.audit_events where customer_id = e) = 9,
         'the member''s writes did not make exactly nine events';
  assert not exists (select 1 from public.audit_events where customer_id = e and actor_id is distinct from e2),
         'an event of the member''s has another actor';

  select * into ev from public.audit_events where row_id = job and action = 'insert';
  assert ev.table_name = 'jobs' and ev.fields is null and ev.before is null
         and ev.after = jsonb_build_object('title', 'Job E', 'location', 'Malmö', 'status', 'open'),
         'a new job''s event is wrong';
  assert (select count(*) from public.audit_events where row_id = job and action = 'update') = 1,
         'an update that changed nothing wrote an event';
  select * into ev from public.audit_events where row_id = job and action = 'update';
  assert ev.fields = array['title', 'description'], 'a job update does not name the changed fields';
  assert ev.before ->> 'title' = 'Job E' and ev.after ->> 'title' = 'Job E, renamed'
         and not ev.before ? 'description' and not ev.after ? 'description',
         'a job update does not keep the title, or copies the description';

  select * into ev from public.audit_events where row_id = card and action = 'insert';
  assert ev.table_name = 'applications'
         and ev.after = jsonb_build_object('job_id', job, 'candidate_id', cand, 'stage_id', first_open),
         'a new card''s event does not hold its job, candidate and first open column';
  assert (select count(*) from public.audit_events where row_id = card and action = 'update') = 1,
         'a card reordered within its column wrote an event';
  select * into ev from public.audit_events where row_id = card and action = 'update';
  assert ev.fields = array['stage_id'] and ev.before ->> 'stage_id' = first_open::text
         and ev.after ->> 'stage_id' = offer::text and ev.after ->> 'candidate_id' = cand::text,
         'a card move does not hold the column before and after';
  select * into ev from public.audit_events where row_id = other_card and action = 'delete';
  assert ev.after is null and ev.before ->> 'job_id' = other_job::text, 'a removed job link''s event is wrong';

  select * into ev from public.audit_events where row_id = cand and action = 'update';
  assert ev.fields = array['email', 'notes'], 'a candidate update does not name the changed fields';

  -- The admin, acting for the company, and the service role.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin), true);
  update public.jobs set status = 'closed' where id = job;
  reset role;
  select * into ev from public.audit_events where row_id = job order by id desc limit 1;
  assert ev.actor_id = admin and ev.customer_id = e and ev.fields = array['status'],
         'the admin''s change is not logged as the admin''s, for the company';
  set local role service_role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.jobs set location = 'Lund' where id = job;
  reset role;
  select * into ev from public.audit_events where row_id = job order by id desc limit 1;
  assert ev.actor_id is null and ev.fields = array['location'], 'a service role change has an actor';

  -- The candidate is deleted, with its last card: the delete is logged, and its events stay.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', e2), true);
  delete from public.candidates where id = cand;
  reset role;
  assert exists (select 1 from public.audit_events where row_id = card and action = 'delete'),
         'a card removed with its candidate was not logged';
  assert (select array_agg(action order by id) from public.audit_events where row_id = cand)
         = array['insert', 'update', 'delete'], 'a deleted candidate''s events are not all kept';
  assert not exists (select 1 from public.audit_events
                     where table_name = 'candidates' and (before is not null or after is not null)),
         'a candidate event holds values';
  select string_agg(a::text, ' ') into log from public.audit_events a where customer_id = e;
  assert log not ilike '%secret%' and log not ilike '%long description%' and log not ilike '%another description%',
         'the log holds a candidate''s data or a job description';
  raise notice 'OK 62: every write to a job, candidate or card is logged with its customer and actor, a candidate''s only by field name';
end $$;

-- 63. Each company reads only its own events, an admin reads all, a member of a deleted company
-- none, and no client writes one: not a member, not an admin, not the service role.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000047e1';
  f uuid := '00000000-0000-0000-0000-0000000047f1';
  admin uuid := '00000000-0000-0000-0000-0000000000ad';
  who uuid;
  role_name text;
  e_events bigint;
begin
  insert into public.jobs (customer_id, title) values (f, 'Job F');
  e_events := (select count(*) from public.audit_events where customer_id = e);

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000047f2","role":"authenticated"}', true);
  assert (select array_agg(distinct customer_id) from public.audit_events) = array[f], 'F does not see only its own events';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000047e2","role":"authenticated"}', true);
  assert (select count(*) from public.audit_events) = e_events
         and not exists (select 1 from public.audit_events where customer_id <> e), 'E does not see only its own events';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin), true);
  assert exists (select 1 from public.audit_events where customer_id = e)
         and exists (select 1 from public.audit_events where customer_id = f), 'the admin does not see every company''s events';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  assert pg_temp.error_of('select 1 from public.audit_events') = '42501', 'a signed-out user reads the log';

  reset role;
  update public.companies set deleted_at = now() where id = e;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000047e2","role":"authenticated"}', true);
  assert not exists (select 1 from public.audit_events), 'a member of a deleted company reads its events';
  reset role;
  update public.companies set deleted_at = null where id = e;

  foreach who in array array['00000000-0000-0000-0000-0000000047e2'::uuid, admin] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', who), true);
    assert pg_temp.error_of(format(
             'insert into public.audit_events (customer_id, action, table_name, row_id) values (%L, ''insert'', ''jobs'', %L)',
             e, gen_random_uuid())) = '42501', 'a client wrote an event';
    assert pg_temp.error_of('update public.audit_events set actor_id = null') = '42501', 'a client changed an event';
    assert pg_temp.error_of('delete from public.audit_events') = '42501', 'a client deleted an event';
    assert pg_temp.error_of('truncate public.audit_events') = '42501', 'a client emptied the log';
    reset role;
  end loop;
  set local role service_role;
  assert pg_temp.error_of(format(
           'insert into public.audit_events (customer_id, action, table_name, row_id) values (%L, ''insert'', ''jobs'', %L)',
           e, gen_random_uuid())) = '42501', 'the service role wrote an event';
  assert pg_temp.error_of('update public.audit_events set actor_id = null') = '42501', 'the service role changed an event';
  assert pg_temp.error_of('delete from public.audit_events') = '42501', 'the service role deleted an event';
  reset role;
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_function_privilege(role_name, 'public.write_audit_event()', 'execute'),
           format('%s may run the audit trigger function', role_name);
  end loop;
  assert (select count(*) from public.audit_events where customer_id = e) = e_events, 'a refused write changed the log';
  raise notice 'OK 63: each company reads only its own events, an admin all, and no client or service role writes one';
end $$;

-- 64. A company delete takes its log with it, and its cascade writes no event for the company
-- being deleted. The service role deletes, as admin-manage-company's "delete for good" does.
reset role;
do $$ declare
  e uuid := '00000000-0000-0000-0000-0000000047e1';
  f uuid := '00000000-0000-0000-0000-0000000047f1';
  job uuid; cand uuid;
begin
  insert into public.candidates (customer_id, full_name) values (f, 'Cand F') returning id into cand;
  select id into job from public.jobs where customer_id = f;
  insert into public.applications (job_id, candidate_id) values (job, cand);
  assert (select count(*) from public.audit_events where customer_id = f) = 3, 'F''s rows are not logged';
  set local role service_role;
  delete from public.companies where id = f;
  reset role;
  assert not exists (select 1 from public.audit_events where customer_id = f), 'a deleted company''s events stayed';
  assert not exists (select 1 from public.audit_events a where not exists (select 1 from public.companies c where c.id = a.customer_id)),
         'an event outlived its company';
  assert exists (select 1 from public.audit_events where customer_id = e), 'deleting F removed E''s events';
  raise notice 'OK 64: deleting a company removes its events and writes none for its rows';
end $$;

-- ---------------------------------------------------------------- reading the history (ATS-48)
-- Companies C and D, each with a named second member who signs in for it.
reset role;
select pg_temp.add_customer('00000000-0000-0000-0000-0000000048c1', 'history-c-48@test.local');
select pg_temp.add_customer('00000000-0000-0000-0000-0000000048d1', 'history-d-48@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048c2', 'history-c2-48@test.local');
select pg_temp.add_member('00000000-0000-0000-0000-0000000048d1', '00000000-0000-0000-0000-0000000048d2', 'history-d2-48@test.local');
update public.profiles set full_name = 'Cecilia' where id = '00000000-0000-0000-0000-0000000048c2';
update public.profiles set full_name = 'David' where id = '00000000-0000-0000-0000-0000000048d2';
update public.profiles set full_name = 'Admin Name' where id = '00000000-0000-0000-0000-0000000000ad';

-- 65. A candidate's history is its own events and its cards', found by candidate_id, which the
-- database fills: the row for a candidate, the card's candidate for a card, nothing for a job.
-- An account's actions are found by actor_id, in every company.
do $$ declare
  c uuid := '00000000-0000-0000-0000-0000000048c1';
  c2 uuid := '00000000-0000-0000-0000-0000000048c2';
  job uuid; cand uuid; other_cand uuid; card uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c2), true);
  insert into public.jobs (customer_id, title) values (c, 'Job C') returning id into job;
  insert into public.candidates (customer_id, full_name) values (c, 'Cand C') returning id into cand;
  insert into public.candidates (customer_id, full_name) values (c, 'Other C') returning id into other_cand;
  insert into public.applications (job_id, candidate_id) values (job, cand) returning id into card;
  perform public.move_application(card, c, pg_temp.stage_of(c, 'interview'));
  update public.candidates set notes = 'Note' where id = cand;
  delete from public.applications where id = card;
  update public.jobs set title = 'Job C, renamed' where id = job;

  assert (select array_agg(table_name || ':' || action order by id) from public.audit_events where candidate_id = cand)
         = array['candidates:insert', 'applications:insert', 'applications:update', 'candidates:update', 'applications:delete'],
         'a candidate''s history is not its own events and its cards''';
  assert not exists (select 1 from public.audit_events where table_name = 'jobs' and candidate_id is not null),
         'a job event names a candidate';
  assert (select count(*) from public.audit_events where candidate_id = other_cand) = 1,
         'another candidate''s history is not its own';
  reset role;
  assert pg_temp.error_of(format('update public.audit_events set candidate_id = %L', other_cand)) = '428C9',
         'candidate_id can be written';
  assert (select count(*) from public.audit_events where actor_id = c2) = 8
         and not exists (select 1 from public.audit_events where actor_id = c2 and customer_id <> c),
         'an account''s actions are not all its own';
  assert exists (select 1 from pg_indexes where indexname = 'audit_events_candidate_idx')
         and exists (select 1 from pg_indexes where indexname = 'audit_events_actor_idx'),
         'the two histories have no index';
  raise notice 'OK 65: a candidate''s history holds its own and its cards'' events, and an account''s holds its actions';
end $$;

-- 66. audit_actor_names() names only the actors of the caller's own company's events: a member,
-- a former member, and an admin only as an admin. Nobody else, and nothing for a purged user.
-- An admin gets every name.
reset role;
do $$ declare
  c uuid := '00000000-0000-0000-0000-0000000048c1';
  d uuid := '00000000-0000-0000-0000-0000000048d1';
  c2 uuid := '00000000-0000-0000-0000-0000000048c2';
  d2 uuid := '00000000-0000-0000-0000-0000000048d2';
  moved uuid := '00000000-0000-0000-0000-0000000048c3';
  purged uuid := '00000000-0000-0000-0000-0000000048c4';
  admin uuid := '00000000-0000-0000-0000-0000000000ad';
  quiet uuid := pg_temp.first_user('00000000-0000-0000-0000-0000000048c1');
  everyone uuid[];
  names text;
begin
  perform pg_temp.add_member(c, moved, 'history-c3-48@test.local');
  perform pg_temp.add_member(c, purged, 'history-c4-48@test.local');
  update public.profiles set full_name = 'Moved' where id = moved;
  everyone := array[c2, d2, moved, purged, admin, quiet];
  set local role authenticated;
  foreach names in array array[moved::text, purged::text, admin::text, d2::text] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', names), true);
    insert into public.jobs (customer_id, title) values (case when names = d2::text then d else c end, 'Job by ' || names);
  end loop;
  reset role;
  update public.company_members set company_id = d where user_id = moved;
  delete from auth.users where id = purged;

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c2), true);
  select string_agg(coalesce(full_name, '-') || ':' || is_admin, ',' order by full_name nulls last)
    into names from public.audit_actor_names(everyone);
  assert names = 'Cecilia:false,Moved:false,-:true',
         format('C''s member gets the wrong names: %s', names);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', d2), true);
  select string_agg(full_name, ',' order by full_name) into names from public.audit_actor_names(everyone);
  assert names = 'David', format('D''s member gets the wrong names: %s', names);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin), true);
  select string_agg(full_name, ',' order by full_name) into names from public.audit_actor_names(everyone);
  assert names = 'Admin Name,Cecilia,David,Moved', format('the admin gets the wrong names: %s', names);
  assert exists (select 1 from public.audit_events where actor_id = purged), 'a purged user''s events are gone';
  reset role;
  update public.companies set deleted_at = now() where id = c;
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c2), true);
  assert not exists (select 1 from public.audit_actor_names(everyone)), 'a member of a deleted company gets names';
  reset role;
  update public.companies set deleted_at = null where id = c;
  assert not has_function_privilege('anon', 'public.audit_actor_names(uuid[])', 'execute'), 'anon may look up names';
  raise notice 'OK 66: the actors'' names come only for the caller''s own company''s events, an admin only as an admin';
end $$;

rollback;
