#!/usr/bin/env bash
# =============================================================================
# Mini-ATS — writes to a customer's columns while other writes are under way (ATS-38)
#
# rls_test.sql runs in one session, so it cannot show how concurrent writes wait for each other.
# This script runs them in separate sessions as the customer, the way the app calls them:
#
#   1. While a move holds the customer's lock, renaming a column and removing an empty one go
#      through without waiting for it. Waiting there, with the row held, could deadlock with the
#      move (PR #101).
#   2. Two removals of the customer's two rejected columns wait for each other: the second is
#      refused with stage_rejected_required.
#   3. A move into a column that is being removed waits for the removal, then fails on the
#      foreign key instead of pointing at a removed column.
#   4. A reset while a removal holds its column and the removal lock waits for the column, not
#      the other way round, so the two never deadlock (ATS-40). The reset then brings back the
#      six defaults.
#
# Each step holds its first session open on advisory lock HOLD_KEY until the second one is seen
# waiting. No sleeps decide the order: each step waits until Postgres shows the previous one.
# Needs psql and the PG* environment variables, against a database with local_stub.sql and the
# migrations applied (the CI RLS job). Leaves no data behind.
# =============================================================================
set -euo pipefail

CUSTOMER=00000000-0000-0000-0000-0000000038c1
JOB=10000000-0000-0000-0000-0000000038c1
CARD_1=30000000-0000-0000-0000-0000000038c1
CARD_2=30000000-0000-0000-0000-0000000038c2
HOLD_KEY=4444
TIMEOUT_SECONDS=15
CLAIMS="{\"sub\":\"$CUSTOMER\",\"role\":\"authenticated\"}"
SECOND_ERROR=$(mktemp)

q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

cleanup() {
  q -c "select pg_terminate_backend(pid) from pg_stat_activity
        where application_name like 'stages_test_%' and pid <> pg_backend_pid()" >/dev/null || true
  q -c "delete from public.companies where id = '$CUSTOMER'" >/dev/null || true
  q -c "delete from auth.users where id = '$CUSTOMER'" >/dev/null || true
  rm -f "$SECOND_ERROR"
}
trap cleanup EXIT

fail() {
  echo "FAIL pipeline stages concurrency: $1" >&2
  exit 1
}

# Waits until the query returns t, or fails after TIMEOUT_SECONDS.
wait_until() {
  local what=$1 sql=$2
  for _ in $(seq $((TIMEOUT_SECONDS * 10))); do
    [[ $(q -c "$sql") == t ]] && return 0
    sleep 0.1
  done
  fail "timed out waiting for $what"
}

# True when the session is blocked on an advisory lock, or on a row another transaction holds.
waiting_on_advisory_lock() {
  echo "select exists (select 1 from pg_stat_activity
         where application_name = '$1' and wait_event_type = 'Lock' and wait_event = 'advisory')"
}
waiting_on_row() {
  echo "select exists (select 1 from pg_stat_activity
         where application_name = '$1' and wait_event_type = 'Lock'
           and wait_event in ('transactionid', 'tuple'))"
}

# SQL as the customer, in its own transaction. Extra SQL runs before the commit. A step that must
# not wait sets STATEMENT_TIMEOUT, so it fails instead of waiting.
as_customer() {
  local name=$1 sql=$2 before_commit=${3:-}
  PGAPPNAME=$name q <<SQL >/dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$CLAIMS', true);
set local statement_timeout = '${STATEMENT_TIMEOUT:-0}';
$sql;
$before_commit
commit;
SQL
}

# A holder session keeps HOLD_KEY until release, so the first session waits before its commit.
hold() {
  PGAPPNAME=stages_test_holder q -c "select pg_advisory_lock($HOLD_KEY), pg_sleep($TIMEOUT_SECONDS * 2)" \
    >/dev/null 2>&1 &
  wait_until "the holder's lock" \
    "select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $HOLD_KEY and granted)"
}
release() {
  q -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'stages_test_holder'" \
    >/dev/null
}
WAIT_FOR_HOLDER="select pg_advisory_xact_lock_shared($HOLD_KEY);"

stage() {
  q -c "select id from public.pipeline_stages where customer_id = '$CUSTOMER' and $1"
}

# One customer, a company under its user's id with the user as member (ATS-44), with two cards in
# the new column, and a second rejected column.
q <<SQL
insert into auth.users (id, email, raw_app_meta_data) values ('$CUSTOMER', 'stages-c-38@test.local', '{"role":"customer"}');
insert into public.companies (id, name) values ('$CUSTOMER', 'Company C');
insert into public.company_members (company_id, user_id) values ('$CUSTOMER', '$CUSTOMER');
insert into public.jobs (id, customer_id, title) values ('$JOB', '$CUSTOMER', 'Job C 38');
insert into public.candidates (id, customer_id, full_name) values
  ('20000000-0000-0000-0000-0000000038c1', '$CUSTOMER', 'Cand C1 38'),
  ('20000000-0000-0000-0000-0000000038c2', '$CUSTOMER', 'Cand C2 38');
insert into public.applications (id, job_id, candidate_id) values
  ('$CARD_1', '$JOB', '20000000-0000-0000-0000-0000000038c1'),
  ('$CARD_2', '$JOB', '20000000-0000-0000-0000-0000000038c2');
insert into public.pipeline_stages (customer_id, name, position, kind, colour)
values ('$CUSTOMER', 'Nej tack', 6, 'rejected', 'red');
SQL
SCREENING=$(stage "default_key = 'screening'")
INTERVIEW=$(stage "default_key = 'interview'")
OFFER=$(stage "default_key = 'offer'")
REJECTED=$(stage "default_key = 'rejected'")
SECOND_REJECTED=$(stage "name = 'Nej tack'")

# 1. A rename and a removal while a move holds the customer's lock.
hold
as_customer stages_test_move \
  "select 1 from public.move_application('$CARD_1', '$CUSTOMER', '$SCREENING'::uuid)" "$WAIT_FOR_HOLDER" &
MOVE=$!
wait_until "the move to hold the customer's lock" "$(waiting_on_advisory_lock stages_test_move)"
STATEMENT_TIMEOUT=5s as_customer stages_test_rename "update public.pipeline_stages set name = 'Intervju 2' where id = '$INTERVIEW'" \
  || fail "a rename waited for the move or failed"
STATEMENT_TIMEOUT=5s as_customer stages_test_remove "delete from public.pipeline_stages where id = '$OFFER'" \
  || fail "removing an empty column waited for the move or failed"
release
wait "$MOVE" || fail "the move failed"
echo "OK 1: a rename and a removal go through while a move holds the customer's lock"

# 2. Two removals of the two rejected columns.
hold
as_customer stages_test_first "delete from public.pipeline_stages where id = '$REJECTED'" "$WAIT_FOR_HOLDER" &
FIRST=$!
wait_until "the first removal to be done" "$(waiting_on_advisory_lock stages_test_first)"
as_customer stages_test_second "delete from public.pipeline_stages where id = '$SECOND_REJECTED'" \
  2>"$SECOND_ERROR" &
SECOND=$!
wait_until "the second removal to wait for the first" "$(waiting_on_advisory_lock stages_test_second)"
release
wait "$FIRST" || fail "the first removal failed"
wait "$SECOND" && fail "both rejected columns were removed"
grep -q "stage_rejected_required" "$SECOND_ERROR" \
  || fail "the second removal failed without stage_rejected_required: $(cat "$SECOND_ERROR")"
echo "OK 2: two removals of the last two rejected columns: one succeeds, the other gets stage_rejected_required"

# 3. A move into a column that is being removed.
hold
as_customer stages_test_remove_column "delete from public.pipeline_stages where id = '$INTERVIEW'" \
  "$WAIT_FOR_HOLDER" &
REMOVE=$!
wait_until "the removal to be done" "$(waiting_on_advisory_lock stages_test_remove_column)"
as_customer stages_test_move_in \
  "select 1 from public.move_application('$CARD_2', '$CUSTOMER', '$INTERVIEW'::uuid)" 2>"$SECOND_ERROR" &
MOVE_IN=$!
wait_until "the move to wait for the removal" "$(waiting_on_row stages_test_move_in)"
release
wait "$REMOVE" || fail "the removal failed"
wait "$MOVE_IN" && fail "a card was moved into a removed column"
grep -q "applications_stage_id_fkey" "$SECOND_ERROR" \
  || fail "the move failed without the foreign key: $(cat "$SECOND_ERROR")"
[[ $(q -c "select stage_id from public.applications where id = '$CARD_2'") == "$(stage "default_key = 'new'")" ]] \
  || fail "the card left the new column"
echo "OK 3: a move into a column being removed waits for the removal, then fails on the foreign key"

# 4. A reset while a removal holds its column and the removal lock.
q -c "insert into public.pipeline_stages (customer_id, name, position, kind, colour)
      values ('$CUSTOMER', 'Tom', 7, 'open', 'grey')" >/dev/null
EMPTY=$(stage "name = 'Tom'")
hold
as_customer stages_test_remove_empty "delete from public.pipeline_stages where id = '$EMPTY'" \
  "$WAIT_FOR_HOLDER" &
REMOVE=$!
wait_until "the removal to be done" "$(waiting_on_advisory_lock stages_test_remove_empty)"
as_customer stages_test_reset "select 1 from public.reset_stages('$CUSTOMER')" 2>"$SECOND_ERROR" &
RESET=$!
wait_until "the reset to wait for the removed column" "$(waiting_on_row stages_test_reset)"
release
wait "$REMOVE" || fail "the removal failed"
wait "$RESET" || fail "the reset failed: $(cat "$SECOND_ERROR")"
[[ $(q -c "select string_agg(default_key, ',' order by position) from public.pipeline_stages
           where customer_id = '$CUSTOMER'") == new,screening,interview,offer,hired,rejected ]] \
  || fail "the reset did not bring back the six defaults"
echo "OK 4: a reset waits for a removal that holds its column, then brings back the defaults"
