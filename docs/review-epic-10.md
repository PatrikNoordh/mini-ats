# Review of Epic 10 — Audit log

Reviewed on 17 November 2026 with `/ats-epic-review`, on `main` at `d28e0a3` (after PR #130). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

All 4 tickets are closed with merged PRs that use the template, all 26 acceptance criteria are in the code, the security checks hold, CI on `main` is green, and the full validation passes locally. Nothing was a blocker. The developer ran the checks against the project the same day, and they all passed (see Deployment).

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-61 #125, ATS-62 #129, ATS-47 #127, ATS-48 #128. Every PR comes from an `ats/ATS-<N>-…` branch, uses the template and closes its issue. #130 is a docs-only follow-up to ATS-62 that closes no issue and says so. The bodies of #125 and #128 quote Swedish UI labels; both were merged before #130 made English labels the rule, which applies from then on |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. The new `audit_events` has RLS, a `select` policy per company or admin, and only `select` for `authenticated` and the service role. Only `write_audit_event()`, security definer and not executable by any client role, writes it; the actor is `auth.uid()`, and a candidate event copies no values. `audit_actor_names()` names only the actors of the caller's own company's events, and an admin only as "Admin". No Edge Function was added |
| Code quality | No TODO, `console.log`, `any` (outside the generated route tree), raw colours, arbitrary sizes or hardcoded text. ATS-62's column widths are named tokens in `src/styles.css`. `candidateHistory` keys include the customer id; `accountHistory(accountId)` is admin-only and spans every company |
| Validation | `npm ci`, lint, `tsc`, 814/814 tests in 70 files and the build pass. CI on `main` is green on `d28e0a3`: app, Edge Functions, RLS and end-to-end tests |
| Acceptance criteria | 26 of 26 met: ATS-61 11, ATS-62 7, ATS-47 3, ATS-48 5 |
| Checkpoint | Covered end to end: `e2e/history.spec.ts` drags a card to another column and expects the move, named for the teammate who made it, at the top of the candidate's **History** tab. A card reordered within its column writes no event, by design. The developer also ran it by hand in production on 17 November 2026 |
| Deployment | No route tree diff after a build, and no new `VITE_*` variable. Vercel production is green on `d28e0a3`. The developer ran `gen types --remote` (no diff against the committed `types.ts`), `migration list --remote` (all 29 migrations on Remote) and `functions list` (all 6 functions active). `admin-create-user` and `admin-manage-account` were deployed 2026-11-15 08:19 UTC, after their last change on 2026-11-13 and before PR #125 merged; the other four after their own last change. `admin-manage-company` bundles `_shared/logins.ts`, which ATS-61 changed after its deploy, but only by adding code; the `setBanned` it uses is unchanged |

Not verified by the review itself: Claude does not run the Supabase CLI against the project, so the developer ran those commands and pasted the results, which the Deployment row records.

## Warnings and what was done

| Warning | Decision |
|---|---|
| A history says it was cut off when it shows exactly `HISTORY_LIMIT` events, also when there were exactly that many | Already in the findings list from PR #128; #131 ATS-63, AC4 |
| `audit_events` has no retention | Already in the findings list from PR #127; #131 ATS-63, AC3 |
| Swedish UI text in code comments (`src/lib/history.ts`, `DeletedAccounts.tsx`, `DeletedCompanies.tsx`, `CandidateCvField.tsx`) | Dropped: all written before PR #130, which decided that older text stays as written |
| 8 lines in the `TICKETS.md` findings lists | Triaged, see below. The lists are now empty |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. No open ticket in epics 11 and 12 (email, a customer's own theme) touches the same code, so no finding became an extra AC. The zod 4 migration got a ticket of its own, since it changes every schema and is too large for a hygiene ticket. Like ATS-61 for epic 10, both tickets go into the next epic's milestone, Epic 11 — Email, to be done first.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| `zod` has a high advisory (GHSA-mrhx-c7xc-m3w5) fixed only in zod 4 | ATS-61 | #132 ATS-64 |
| `typescript-eslint` pulls a `minimatch` with a moderate advisory (GHSA-g3hv-75wg-m249), with no fixed release yet | ATS-61 | #131 ATS-63, AC6 |
| Two races the ATS-61 lock design leaves: a restore during a company restore, a move during a company delete | ATS-61 | Dropped: both fail safe, and repeating the step puts it right. Kept as an accepted 🟢 gap in `docs/data-safety.md` § 7 |
| `login_swap_blockers()` is named after the retired swap | ATS-61 | #131 ATS-63, AC5 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| An account update refused with `company_deleted` returns 409 after the name, email and role are saved | PR #125, ATS-61 | #131 ATS-63, AC1 |
| The `company_deleted` mapping from a membership write is written twice | PR #125, ATS-61 | #131 ATS-63, AC2 |
| `audit_events` grows without limit | PR #127, ATS-47 | #131 ATS-63, AC3 |
| The history's "cut off" note shows at exactly `HISTORY_LIMIT` events | PR #128, ATS-48 | #131 ATS-63, AC4 |

### New tickets

- **#131 [ATS-63] Small hygiene fixes from epic 10** — `chore`, `security` and `database`, milestone Epic 11 — Email. The half-done account update and the duplicated `company_deleted` mapping in the admin Edge Functions, a retention decision for the audit log, the history's "cut off" note, `login_swap_blockers()` renamed, and the `minimatch` advisory checked again.
- **#132 [ATS-64] Migrate to zod 4** — `chore` and `security`, milestone Epic 11 — Email. zod and `@hookform/resolvers` upgraded in the app and the Edge Functions, with every schema keeping its behaviour and error codes.

## Data safety

The full run was made on 17 November 2026 on `d28e0a3`: the 29 migrations applied to a throwaway Postgres 17, then `rls_test.sql`, which passed (checks 1–66, 72 OK lines), and the four concurrency scripts (`move_application`, `last_admin`, `pipeline_stages`, `membership`), which passed in the same database. No 🔴 risk.

The schema matched the map: every foreign key, RLS flag, table and column grant, policy, security definer function and trigger. The ATS-47 and ATS-48 PRs had already updated the map in diff mode, so this run changed only the header and § 7 of `docs/data-safety.md`:

- **New gap, 🟡:** the half-done account update with `company_deleted`. → #131 ATS-63, AC1.
- **New gap, 🟢:** `audit_events` has no retention. Its events hold ids and field names, never a candidate's values. → #131 ATS-63, AC3.
- **Gap accepted, 🟢:** the two races the ATS-61 lock design leaves, re-pointed from `TICKETS.md` to this report.
- **Unchanged, 🟢:** the deny rules cannot see a path built at run time (ATS-61 AC5, written down).
- **Gaps closed since the last full run:** a card's and an assessment's owner change (ATS-61 AC1, check 55), the login swap able to resume (ATS-61 AC2), and the admin-write races from ATS-44 and ATS-46 (ATS-61 AC7, check 61, `membership_concurrency.sh`).

## Notes for epic 11

- Do #131 ATS-63 and #132 ATS-64 first. ATS-63 AC1 and AC2 touch `admin-create-user`, which ATS-50 (invites) changes next, so the shared membership helper should exist before it.
- Invites and password reset (ATS-50, ATS-51) create and change logins outside the admin dialog. Keep the ATS-61 rule that a ban follows the membership, and check that a deleted account or a member of a deleted company cannot accept an invite or reset a password.
- Decide the audit log's retention (ATS-63 AC3) before the first real customer. Changing it later means deleting history someone may already rely on.
