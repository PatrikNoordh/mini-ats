#!/usr/bin/env bash
# =============================================================================
# Mini-ATS — a membership written while its account is promoted, or its company deleted (ATS-61)
#
# rls_test.sql runs in one session, so it cannot show that two writes wait for each other. This
# script runs two sessions with the service role, the way the admin Edge Functions write, and
# checks each race in both orders:
#
#   1. Membership first, then a promotion to admin: the promotion waits, then removes it.
#   2. Promotion first, then a membership: the membership waits, then is refused
#      (admin_cannot_be_member).
#   3. Membership first, then the company's delete: the delete waits, and the members it reads
#      afterwards, to ban them, include the new one.
#   4. Delete first, then a membership: the membership waits, then is refused (company_deleted).
#
# In each case session X writes first and then waits for advisory lock HOLD_KEY inside its
# transaction, a holder session keeps that lock, and session Y must be seen waiting for X's row
# lock before the holder is ended. No sleeps decide the order: each step waits until Postgres
# shows the previous one. Without the locks in check_company_member(), Y never waits and the case
# fails. Needs psql and the PG* environment variables, against a database with local_stub.sql and
# the migrations applied (the CI RLS job). Leaves no data behind.
# =============================================================================
set -euo pipefail

COMPANY=00000000-0000-0000-0000-0000000061c1
USER_ID=00000000-0000-0000-0000-0000000061d1
HOLD_KEY=6161
TIMEOUT_SECONDS=15
Y_ERROR=$(mktemp)
X_ERROR=$(mktemp)

q() { psql -X -v ON_ERROR_STOP=1 -qtA "$@"; }

end_sessions() {
  q -c "select pg_terminate_backend(pid) from pg_stat_activity
        where application_name like 'membership_test_%' and pid <> pg_backend_pid()" >/dev/null || true
}

cleanup() {
  end_sessions
  q -c "delete from public.companies where id = '$COMPANY'" >/dev/null || true
  q -c "delete from auth.users where id = '$USER_ID'" >/dev/null || true
  rm -f "$Y_ERROR" "$X_ERROR"
}
trap cleanup EXIT

fail() {
  echo "FAIL membership concurrency: $*" >&2
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

# True when the session is blocked on an advisory lock, or on another session's row.
waiting_on() {
  local name=$1 kind=$2
  if [[ $kind == advisory ]]; then
    echo "select exists (select 1 from pg_stat_activity
           where application_name = '$name' and wait_event_type = 'Lock' and wait_event = 'advisory')"
  else
    echo "select exists (select 1 from pg_stat_activity
           where application_name = '$name' and wait_event_type = 'Lock' and wait_event <> 'advisory')"
  fi
}

# One write with the service role, in its own transaction. Extra SQL runs before the commit.
write() {
  local name=$1 sql=$2 before_commit=${3:-}
  PGAPPNAME=$name q <<SQL >/dev/null
begin;
set local role service_role;
$sql
$before_commit
commit;
SQL
}

# A fresh customer account without a company, and an active company with no members.
reset_state() {
  q -c "delete from public.companies where id = '$COMPANY'" >/dev/null
  q -c "delete from auth.users where id = '$USER_ID'" >/dev/null
  q -c "insert into auth.users (id, email, raw_app_meta_data)
        values ('$USER_ID', 'member-61@test.local', '{\"role\":\"customer\"}')" >/dev/null
  q -c "insert into public.companies (id, name) values ('$COMPANY', 'Bolag 61')" >/dev/null
}

JOIN="insert into public.company_members (company_id, user_id) values ('$COMPANY', '$USER_ID');"
PROMOTE="update public.profiles set role = 'admin' where id = '$USER_ID';"
DELETE_COMPANY="update public.companies set deleted_at = now() where id = '$COMPANY';"

# Runs X (which then holds HOLD_KEY's turn), then Y, which must wait for X's row lock. Sets X_OK
# and Y_OK to whether each committed.
race() {
  local x_sql=$1 y_sql=$2
  : >"$X_ERROR"
  : >"$Y_ERROR"
  PGAPPNAME=membership_test_holder q -c "select pg_advisory_lock($HOLD_KEY), pg_sleep($TIMEOUT_SECONDS * 2)" \
    >/dev/null 2>&1 &
  wait_until "the holder's lock" \
    "select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $HOLD_KEY and granted)"

  write membership_test_x "$x_sql" "select pg_advisory_xact_lock_shared($HOLD_KEY);" 2>"$X_ERROR" &
  local x=$!
  wait_until "X to write and wait" "$(waiting_on membership_test_x advisory)"

  write membership_test_y "$y_sql" 2>"$Y_ERROR" &
  local y=$!
  wait_until "Y to wait for X's row lock" "$(waiting_on membership_test_y row)"

  q -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'membership_test_holder'" \
    >/dev/null
  X_OK=true
  wait "$x" || X_OK=false
  Y_OK=true
  wait "$y" || Y_OK=false
}

member_count() {
  q -c "select count(*) from public.company_members where user_id = '$USER_ID'"
}

# 1. Membership first, then the promotion.
reset_state
race "$JOIN" "$PROMOTE"
[[ $X_OK == true && $Y_OK == true ]] || fail "case 1: a write failed: $(cat "$X_ERROR" "$Y_ERROR")"
[[ $(member_count) == 0 ]] || fail "case 1: an account promoted to admin is still a member"
echo "OK 1: a promotion waits for a membership being written, then removes it"

# 2. Promotion first, then the membership.
reset_state
race "$PROMOTE" "$JOIN"
[[ $X_OK == true ]] || fail "case 2: the promotion failed: $(cat "$X_ERROR")"
[[ $Y_OK == false ]] && grep -q "admin_cannot_be_member" "$Y_ERROR" ||
  fail "case 2: the membership was not refused with admin_cannot_be_member: $(cat "$Y_ERROR")"
[[ $(member_count) == 0 ]] || fail "case 2: an admin became a member"
echo "OK 2: a membership waits for a promotion being written, then is refused"

# 3. Membership first, then the delete; the delete's member read comes after its mark.
reset_state
race "$JOIN" "$DELETE_COMPANY"
[[ $X_OK == true && $Y_OK == true ]] || fail "case 3: a write failed: $(cat "$X_ERROR" "$Y_ERROR")"
[[ $(q -c "select count(*) from public.company_members where company_id = '$COMPANY'") == 1 ]] ||
  fail "case 3: the delete's member read missed the new member"
echo "OK 3: a company delete waits for a membership being written, and its member read includes it"

# 4. Delete first, then the membership.
reset_state
race "$DELETE_COMPANY" "$JOIN"
[[ $X_OK == true ]] || fail "case 4: the delete failed: $(cat "$X_ERROR")"
[[ $Y_OK == false ]] && grep -q "company_deleted" "$Y_ERROR" ||
  fail "case 4: the membership was not refused with company_deleted: $(cat "$Y_ERROR")"
[[ $(member_count) == 0 ]] || fail "case 4: a user joined a deleted company"
echo "OK 4: a membership waits for a company delete being written, then is refused"
