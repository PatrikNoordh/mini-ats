#!/usr/bin/env bash
# =============================================================================
# Mini-ATS — two move_application calls into the same column at the same time
#
# rls_test.sql runs in one session, so it cannot show that concurrent moves wait for each other.
# This script runs two sessions, A and B, that move two cards into the same empty column:
#
#   1. A holder session takes advisory lock HOLD_KEY.
#   2. A moves card 1 (taking the column lock), then waits for HOLD_KEY inside its transaction.
#   3. B moves card 2 into the same column and must wait for A's column lock.
#   4. Once B is seen waiting, the holder is ended. A commits, then B goes on.
#   5. The two cards must have different positions.
#
# No sleeps decide the order: each step waits until Postgres shows the previous one.
# Needs psql and the PG* environment variables, against a database with local_stub.sql and the
# migrations applied (the CI RLS job). Leaves no data behind.
# =============================================================================
set -euo pipefail

CUSTOMER=00000000-0000-0000-0000-0000000000c1
JOB=10000000-0000-0000-0000-0000000000c1
CARD_1=30000000-0000-0000-0000-0000000000c1
CARD_2=30000000-0000-0000-0000-0000000000c2
HOLD_KEY=4242
TIMEOUT_SECONDS=15
CLAIMS="{\"sub\":\"$CUSTOMER\",\"role\":\"authenticated\"}"

q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

cleanup() {
  q -c "select pg_terminate_backend(pid) from pg_stat_activity
        where application_name like 'move_test_%' and pid <> pg_backend_pid()" >/dev/null || true
  q -c "delete from auth.users where id = '$CUSTOMER'" >/dev/null || true
}
trap cleanup EXIT

# Waits until the query returns t, or fails after TIMEOUT_SECONDS.
wait_until() {
  local what=$1 sql=$2
  for _ in $(seq $((TIMEOUT_SECONDS * 10))); do
    [[ $(q -c "$sql") == t ]] && return 0
    sleep 0.1
  done
  echo "FAIL move_application concurrency: timed out waiting for $what" >&2
  exit 1
}

# True when the session is blocked on an advisory lock.
waiting_on_advisory_lock() {
  echo "select exists (select 1 from pg_stat_activity
         where application_name = '$1' and wait_event_type = 'Lock' and wait_event = 'advisory')"
}

# Seed one customer with two cards in the new column. Deleting the user removes them again.
q <<SQL
insert into auth.users (id, email, raw_app_meta_data) values ('$CUSTOMER', 'c@test.local', '{"role":"customer"}');
insert into public.jobs (id, customer_id, title) values ('$JOB', '$CUSTOMER', 'Job C');
insert into public.candidates (id, customer_id, full_name) values
  ('20000000-0000-0000-0000-0000000000c1', '$CUSTOMER', 'Cand C1'),
  ('20000000-0000-0000-0000-0000000000c2', '$CUSTOMER', 'Cand C2');
insert into public.applications (id, job_id, candidate_id) values
  ('$CARD_1', '$JOB', '20000000-0000-0000-0000-0000000000c1'),
  ('$CARD_2', '$JOB', '20000000-0000-0000-0000-0000000000c2');
SQL

# One move as the customer, in its own transaction. Extra SQL runs before the commit.
move() {
  local name=$1 card=$2 before_commit=${3:-}
  PGAPPNAME=$name q <<SQL >/dev/null
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$CLAIMS', true);
select position from public.move_application('$card', '$CUSTOMER', 'offer');
$before_commit
commit;
SQL
}

PGAPPNAME=move_test_holder q -c "select pg_advisory_lock($HOLD_KEY), pg_sleep($TIMEOUT_SECONDS * 2)" \
  >/dev/null 2>&1 &
wait_until "the holder's lock" \
  "select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $HOLD_KEY and granted)"

move move_test_a "$CARD_1" "select pg_advisory_xact_lock_shared($HOLD_KEY);" &
A=$!
wait_until "A to hold the column lock" "$(waiting_on_advisory_lock move_test_a)"

move move_test_b "$CARD_2" &
B=$!
wait_until "B to wait for A's column lock" "$(waiting_on_advisory_lock move_test_b)"

q -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'move_test_holder'" \
  >/dev/null
wait "$A" || { echo "FAIL move_application concurrency: A failed" >&2; exit 1; }
wait "$B" || { echo "FAIL move_application concurrency: B failed" >&2; exit 1; }

positions=$(q -c "select string_agg(position::text, ',' order by position) from public.applications
                  where id in ('$CARD_1', '$CARD_2') and stage = 'offer'")
if [[ $positions != "0,1" ]]; then
  echo "FAIL move_application concurrency: expected positions 0,1 in the offer column, got '$positions'" >&2
  exit 1
fi
echo "OK: two concurrent move_application calls into one column get different positions ($positions)"
