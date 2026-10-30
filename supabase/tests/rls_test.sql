-- =============================================================================
-- Mini-ATS — RLS tests
--
-- Runs in one transaction and rolls back, so it leaves no data behind.
-- Works in the Supabase SQL Editor, and against a plain Postgres after supabase/tests/local_stub.sql
-- and the migrations (that is how CI runs it).
-- Each check raises an exception on failure. "OK" notices mean the check passed.
-- =============================================================================
begin;

-- Test users (fixed ids so the checks are readable)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.local', '{"role":"admin"}', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.local',     '{"role":"customer"}', '{"full_name":"A","company_name":"Company A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.local',     '{}', '{"full_name":"B","company_name":"Company B"}');

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
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

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
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
  exception when insufficient_privilege then null;
  end;
  reset role;
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'customer', 'B promoted itself';
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
  update public.applications set stage = 'interview' where id = '30000000-0000-0000-0000-0000000000b1';
  assert (select stage from public.applications where id = '30000000-0000-0000-0000-0000000000b1') = 'interview', 'stage';
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
do $$ declare candidate uuid; second uuid; first_pos int; second_pos int; again_pos int; begin
  insert into public.candidates (customer_id, full_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'Cand B4') returning id into candidate;
  insert into public.applications (job_id, candidate_id)
  values ('10000000-0000-0000-0000-0000000000b1', candidate) returning id into second;
  select position into first_pos from public.move_application(
    '30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'offer');
  select position into second_pos from public.move_application(
    second, '00000000-0000-0000-0000-0000000000b1', 'offer');
  select position into again_pos from public.move_application(
    '30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'offer');
  assert first_pos = 0, 'first card in an empty column gets position 0';
  assert second_pos = 1, 'next card lands after it';
  assert again_pos = 2, 'a card moved within its column goes last';
  assert (select stage from public.applications where id = second) = 'offer', 'stage changed';
  delete from public.candidates where id = candidate; -- the counts below expect the seed data only
  raise notice 'OK 7c: move_application sets the stage and the next position in one call';
end $$;

do $$ declare error_code text; other_code text; begin
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'hired');
  exception when raise_exception then error_code := sqlerrm;
  end;
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'hired');
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
  assert (select stage from public.applications where id = '30000000-0000-0000-0000-0000000000a1') = 'new',
         'A''s card survived B''s move attempt';
  perform public.move_application(
    '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'screening');
  assert (select stage from public.applications where id = '30000000-0000-0000-0000-0000000000a1') = 'screening',
         'admin moved A''s card';
  begin
    perform public.move_application(
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'hired');
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
  foreach tbl in array array['profiles', 'jobs', 'candidates', 'applications', 'cv_assessments'] loop
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
      '30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'hired');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 9b: a signed-out user could call move_application'; end if;
  raise notice 'OK 9b: signed-out users cannot move cards';
end $$;

-- ---------------------------------------------------------------- storage
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

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

-- Deleting an account cascades to its jobs and applications in one statement. The job foreign
-- key checks at the end of the statement, so this must still work.
reset role;
do $$ declare job uuid; candidate uuid; begin
  insert into public.jobs (customer_id, title)
  values ('00000000-0000-0000-0000-0000000000a1', 'Job A2') returning id into job;
  insert into public.candidates (customer_id, full_name)
  values ('00000000-0000-0000-0000-0000000000a1', 'Cand A2') returning id into candidate;
  insert into public.applications (job_id, candidate_id) values (job, candidate);
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
  assert not exists (select 1 from public.jobs where customer_id = '00000000-0000-0000-0000-0000000000a1'), 'jobs gone';
  assert not exists (select 1 from public.applications where customer_id = '00000000-0000-0000-0000-0000000000a1'),
         'applications gone';
  raise notice 'OK 19: deleting an account still removes its jobs and cards';
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

do $$ declare blocked boolean := false; begin
  assert not has_table_privilege('authenticated', 'public.cv_assessments', 'insert'), 'no insert';
  assert not has_table_privilege('authenticated', 'public.cv_assessments', 'update'), 'no update';
  assert not has_table_privilege('authenticated', 'public.cv_assessments', 'delete'), 'no delete';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  begin
    delete from public.cv_assessments;
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 21: even an admin client could write cv_assessments'; end if;
  raise notice 'OK 21: authenticated cannot write cv_assessments, not even an admin';
end $$;

-- The grants are exactly what the app uses. A change here is a deliberate change to this list.
do $$ declare actual text; expected text :=
  'applications:DELETE,INSERT,SELECT,UPDATE candidates:DELETE,INSERT,SELECT,UPDATE '
  'cv_assessments:SELECT jobs:DELETE,INSERT,SELECT,UPDATE profiles:SELECT';
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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
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
reset role;
do $$ declare
  customer uuid := '00000000-0000-0000-0000-0000000000d1';
  admin2 uuid := '00000000-0000-0000-0000-0000000000d2';
  job uuid; blocked boolean := false;
begin
  insert into auth.users (id, email, raw_app_meta_data) values
    (customer, 'deleted-customer@test.local', '{"role":"customer"}'),
    (admin2, 'deleted-admin@test.local', '{"role":"admin"}');
  insert into public.jobs (customer_id, title) values (customer, 'Kept job') returning id into job;

  -- 25. A customer cannot mark or unmark itself as deleted: there is no client update on profiles.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', customer), true);
  begin
    update public.profiles set deleted_at = now() where id = customer;
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 25: a customer could set its own deleted_at'; end if;
  raise notice 'OK 25: a client cannot set or clear deleted_at';

  -- 26. A deleted customer's token sees no rows and cannot write, but its data is kept.
  update public.profiles set deleted_at = now() where id in (customer, admin2);
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', customer), true);
  assert (select count(*) from public.jobs) = 0, 'deleted customer sees no jobs';
  assert (select count(*) from public.profiles) = 0, 'deleted customer sees not even its own profile';
  blocked := false;
  begin
    insert into public.jobs (customer_id, title) values (customer, 'After delete');
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  if not blocked then raise exception 'FAIL 26: a deleted customer could still create a job'; end if;
  assert exists (select 1 from public.jobs where id = job), 'the data is kept';
  raise notice 'OK 26: a deleted customer''s token gets no rows, and its data is kept';

  -- 27. A deleted admin is no admin; an active admin still sees the deleted account and its data.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin2), true);
  assert not public.is_admin(), 'a deleted admin is not an admin';
  assert (select count(*) from public.jobs) = 0, 'a deleted admin sees nothing';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
  assert exists (select 1 from public.profiles where id = customer and deleted_at is not null), 'admin sees the deleted account';
  assert exists (select 1 from public.jobs where id = job), 'admin sees its data, for restoring';
  reset role;
  raise notice 'OK 27: a deleted admin is not an admin, and an active admin still sees deleted accounts';

  -- 28. Only accounts deleted more than 30 days ago are due for the purge (the
  -- purge-deleted-accounts function, ATS-17), and deleting one takes its data with it.
  update public.profiles set deleted_at = now() - interval '29 days' where id = customer;
  update public.profiles set deleted_at = now() - interval '31 days' where id = admin2;
  assert admin2 in (select public.accounts_due_for_purge()), 'deleted 31 days ago: due';
  assert customer not in (select public.accounts_due_for_purge()), 'deleted 29 days ago: not due';
  assert '00000000-0000-0000-0000-0000000000ad' not in (select public.accounts_due_for_purge()), 'active admin not due';
  assert not has_function_privilege('anon', 'public.accounts_due_for_purge()', 'execute'), 'anon cannot list';
  assert not has_function_privilege('authenticated', 'public.accounts_due_for_purge()', 'execute'), 'no client can list';
  assert to_regprocedure('public.purge_deleted_accounts()') is null, 'the SQL purge is gone';
  delete from auth.users where id = customer;
  assert not exists (select 1 from public.jobs where id = job), 'its jobs went with it';
  raise notice 'OK 28: only accounts deleted more than 30 days ago are due for the purge, and no client can list them';
end $$;

-- ---------------------------------------------------------------- removing a job link (ATS-30)
-- Its own customers: customer A is deleted by check 19.
reset role;
do $$ declare
  owner uuid := gen_random_uuid(); other uuid := gen_random_uuid(); gone uuid := gen_random_uuid();
  job1 uuid; job2 uuid; cand uuid; app1 uuid; app2 uuid; n integer; blocked boolean := false;
begin
  insert into auth.users (id, email, raw_app_meta_data) values
    (owner, 'owner-30@test.local', '{"role":"customer"}'),
    (other, 'other-30@test.local', '{"role":"customer"}'),
    (gone, 'gone-30@test.local', '{"role":"customer"}');
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

  -- The owner removes its own link; the assessment goes with it, the candidate and job stay.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', owner), true);
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
-- (upsert), which needs the update policy: own folder while active, or an admin.
reset role;
do $$ declare
  -- Not named owner: storage.objects has an owner column, and PL/pgSQL would not know which.
  cv_owner uuid := gen_random_uuid(); cv_other uuid := gen_random_uuid(); cv_gone uuid := gen_random_uuid();
  n integer; blocked boolean := false;
begin
  assert (select file_size_limit from storage.buckets where id = 'cvs') = 5 * 1024 * 1024, 'cvs limit is 5 MB';
  assert (select allowed_mime_types from storage.buckets where id = 'cvs') = array['application/pdf'], 'cvs takes only PDF';

  insert into auth.users (id, email, raw_app_meta_data) values
    (cv_owner, 'owner-17@test.local', '{"role":"customer"}'),
    (cv_other, 'other-17@test.local', '{"role":"customer"}'),
    (cv_gone, 'gone-17@test.local', '{"role":"customer"}');
  insert into storage.objects (bucket_id, name) values
    ('cvs', cv_owner || '/cv-owner.pdf'), ('cvs', cv_other || '/cv-other.pdf'), ('cvs', cv_gone || '/cv-gone.pdf');
  update public.profiles set deleted_at = now() where id = cv_gone;

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cv_owner), true);
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_owner || '/cv-owner.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'the owner could not replace its own CV';
  update storage.objects set name = name where bucket_id = 'cvs' and name = cv_other || '/cv-other.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a customer replaced another customer''s CV';
  begin
    update storage.objects set name = cv_other || '/moved.pdf' where bucket_id = 'cvs' and name = cv_owner || '/cv-owner.pdf';
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL 31: a customer moved its CV into another customer''s folder'; end if;

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
  raise notice 'OK 31: the cvs bucket takes PDFs up to 5 MB, and only the owner while active or an admin replaces a CV';
end $$;

-- ---------------------------------------------------------------- CV upload time (ATS-35)
-- The database stamps cv_uploaded_at whenever cv_path is written, also with the same path (a CV
-- replaced in place), clears it with cv_path, and ignores it from the client.
reset role;
do $$ declare
  customer uuid := gen_random_uuid();
  cand uuid;
  path text;
  first_upload timestamptz;
begin
  insert into auth.users (id, email, raw_app_meta_data) values (customer, 'cv-time-35@test.local', '{"role":"customer"}');
  insert into public.candidates (customer_id, full_name) values (customer, 'Cand 35') returning id into cand;
  path := customer || '/' || cand || '.pdf';
  assert (select cv_uploaded_at from public.candidates where id = cand) is null, 'a candidate without a CV has a CV time';

  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', customer), true);
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

rollback;
