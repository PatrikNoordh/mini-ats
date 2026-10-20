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

do $$ begin
  update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
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
  assert (select count(*) from public.jobs) = 2, 'admin sees all jobs';
  assert (select count(*) from public.candidates) = 2, 'A''s candidate survived B''s delete attempt';
  assert (select count(*) from public.profiles) = 3, 'admin sees all profiles';
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
do $$ begin
  assert (select count(*) from public.jobs) = 0, 'anon sees nothing';
  assert (select count(*) from public.profiles) = 0, 'anon sees no profiles';
  raise notice 'OK 9: signed-out users see nothing';
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

rollback;
