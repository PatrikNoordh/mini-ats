#!/usr/bin/env bash
# =============================================================================
# Mini-ATS — the last two admins removed at the same time (ATS-33)
#
# rls_test.sql runs in one session, so it cannot show that two removals wait for each other.
# This script runs two sessions with the service role, the way admin-manage-account calls
# soft_delete_or_demote_account, while admins A and B are the only active admins:
#
#   1. A holder session takes advisory lock HOLD_KEY.
#   2. X deletes B (taking the last-admin lock), then waits for HOLD_KEY inside its transaction.
#   3. Y demotes A and must wait for X's last-admin lock.
#   4. Once Y is seen waiting, the holder is ended. X commits, then Y goes on.
#   5. Exactly one removal succeeds: Y is refused with last_admin, and A is still an admin.
#
# No sleeps decide the order: each step waits until Postgres shows the previous one.
# Needs psql and the PG* environment variables, against a database with local_stub.sql and the
# migrations applied (the CI RLS job). Leaves no data behind.
# =============================================================================
set -euo pipefail

ADMIN_A=00000000-0000-0000-0000-0000000033a1
ADMIN_B=00000000-0000-0000-0000-0000000033b1
HOLD_KEY=4343
TIMEOUT_SECONDS=15
Y_ERROR=$(mktemp)

q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

cleanup() {
  q -c "select pg_terminate_backend(pid) from pg_stat_activity
        where application_name like 'last_admin_test_%' and pid <> pg_backend_pid()" >/dev/null || true
  q -c "delete from auth.users where id in ('$ADMIN_A', '$ADMIN_B')" >/dev/null || true
  rm -f "$Y_ERROR"
}
trap cleanup EXIT

# Waits until the query returns t, or fails after TIMEOUT_SECONDS.
wait_until() {
  local what=$1 sql=$2
  for _ in $(seq $((TIMEOUT_SECONDS * 10))); do
    [[ $(q -c "$sql") == t ]] && return 0
    sleep 0.1
  done
  echo "FAIL last admin concurrency: timed out waiting for $what" >&2
  exit 1
}

# True when the session is blocked on an advisory lock.
waiting_on_advisory_lock() {
  echo "select exists (select 1 from pg_stat_activity
         where application_name = '$1' and wait_event_type = 'Lock' and wait_event = 'advisory')"
}

if [[ $(q -c "select count(*) from public.profiles where role = 'admin' and deleted_at is null") != 0 ]]; then
  echo "FAIL last admin concurrency: expected a database without active admins" >&2
  exit 1
fi
q -c "insert into auth.users (id, email, raw_app_meta_data) values
        ('$ADMIN_A', 'admin-a-33@test.local', '{\"role\":\"admin\"}'),
        ('$ADMIN_B', 'admin-b-33@test.local', '{\"role\":\"admin\"}')"

# One removal with the service role, in its own transaction. Extra SQL runs before the commit.
remove() {
  local name=$1 account=$2 change=$3 before_commit=${4:-}
  PGAPPNAME=$name q <<SQL >/dev/null
begin;
set local role service_role;
select public.soft_delete_or_demote_account('$account', '$change');
$before_commit
commit;
SQL
}

PGAPPNAME=last_admin_test_holder q -c "select pg_advisory_lock($HOLD_KEY), pg_sleep($TIMEOUT_SECONDS * 2)" \
  >/dev/null 2>&1 &
wait_until "the holder's lock" \
  "select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $HOLD_KEY and granted)"

remove last_admin_test_x "$ADMIN_B" soft_delete "select pg_advisory_xact_lock_shared($HOLD_KEY);" &
X=$!
wait_until "X to hold the last-admin lock" "$(waiting_on_advisory_lock last_admin_test_x)"

remove last_admin_test_y "$ADMIN_A" demote 2>"$Y_ERROR" &
Y=$!
wait_until "Y to wait for X's last-admin lock" "$(waiting_on_advisory_lock last_admin_test_y)"

q -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'last_admin_test_holder'" \
  >/dev/null
wait "$X" || { echo "FAIL last admin concurrency: X failed" >&2; exit 1; }
if wait "$Y"; then
  echo "FAIL last admin concurrency: both removals succeeded" >&2
  exit 1
fi
if ! grep -q "last_admin" "$Y_ERROR"; then
  echo "FAIL last admin concurrency: Y failed without last_admin: $(cat "$Y_ERROR")" >&2
  exit 1
fi

state=$(q -c "select string_agg(role || ':' || (deleted_at is not null)::text, ',' order by email)
              from public.profiles where id in ('$ADMIN_A', '$ADMIN_B')")
if [[ $state != "admin:false,admin:true" ]]; then
  echo "FAIL last admin concurrency: expected A active admin and B deleted, got '$state'" >&2
  exit 1
fi
echo "OK: two concurrent removals of the last two admins: one succeeds, the other gets last_admin"
