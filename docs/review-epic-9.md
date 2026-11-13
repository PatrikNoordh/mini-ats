# Review of Epic 9 — Teams

Reviewed on 13 November 2026 with `/ats-epic-review`, on `main` at `28aad96` (after PR #122). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

All 8 tickets are closed with merged PRs that use the template, all 60 acceptance criteria are in the code, the security checks hold, and CI on `main` is green. The verdict waited only on three checks against the project, which the developer ran the same day: every migration is applied, every Edge Function is deployed after its last change, and the login swap has run.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-43 #113, ATS-57 #115, ATS-60 #117, ATS-44 #118, ATS-45 #119, ATS-46 #120, ATS-58 #121, ATS-59 #122. Every PR comes from an `ats/ATS-<N>-…` branch, uses the template, closes its issue and leaves no AC unticked |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. The new `companies` and `company_members` have RLS and only a `select` grant for clients. Every customer policy and the four `cvs` storage policies ask `current_company_id()`, which is null for a deleted member or company, and every customer check signs in as a company's second member. No customer table references `profiles` or `auth.users`, and `login_swap_blockers()` checks that in the database. The new `admin-manage-company` handles `OPTIONS` and asks `is_admin()` with the caller's JWT before it reads the body |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. The new query keys go through `queryKeys.*`; `profiles()`, `companies()` and `openJobCounts()` are admin-wide lists |
| Validation | `npm ci`, lint, `tsc`, 423/423 tests and the build pass. CI on `main` is green on `28aad96`: app, Edge Functions, RLS and End-to-end tests |
| Acceptance criteria | 60 of 60 met |
| Checkpoint | Covered end to end: `e2e/team.spec.ts` (two users of one company share the board and see each other's changes, another company sees none of it) and `e2e/isolation.spec.ts`, both as the first and the second member |
| Deployment | No route tree diff after a build, and no new `VITE_*` variable. Vercel production is green on `28aad96`, and `mini-ats-submission.vercel.app` returns 404. The developer ran `migration list --remote` (all 24 migrations on Remote) and `functions list` (all 6 functions active; the four admin and purge functions deployed 2026-11-09 20:43 UTC, after their last change at 20:10, and `admin-manage-company` at version 1). In the SQL Editor, no company shares its id with a login, so the login swap has run |

Not verified by the review: the types generated from the project, since Claude does not run the Supabase CLI against it. PRs #118, #120 and #121 record that each migration was pushed with a dry run listing only its own file, and that the regenerated types were committed. The developer did not say whether the checkpoint was also tested by hand in production.

## Warnings and what was done

| Warning | Decision |
|---|---|
| `profiles.company_name`, its sync trigger and the `company_name` path in the Edge Functions had no ticket for their removal, and a comment in `admin-manage-account/index.ts:133` was stale | #123 ATS-61, AC11 |
| PR #120 (ATS-46) was merged before its manual test, which was then run in production | No action: a merged PR is history, and the PR says so |
| ATS-44 broke the admin's open-job counts (`PGRST200`) without CI noticing | Already in the findings list from PR #118; #123 ATS-61, AC9 |
| Edge Cases and Definition of Done boxes were unticked on #107, #109–#112, #114 and #116 | Done now: ticked where a PR's Validation section or the tests show it (34 boxes). Left unticked where nothing shows it: the UI edge cases (loading, empty and error states, 390 px, sv and en) on #107 and #109–#112, admin acting on #111 and #112, the manual test on #112, RLS on #110 (no schema change), and two diff-mode edge cases on #116 |
| `docs/data-safety.md` had no full run since before ATS-44 | Done now: rebuilt in this close-out, see Data safety |
| 13 lines in the `TICKETS.md` findings lists, 2 already ticked | Triaged, see below. The lists are now empty |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. The full data-safety run found one new 🟡: a card's owner can still change. It was first proposed as an extra AC on ATS-47, whose audit triggers on `applications` rely on it. The developer moved it to the hygiene ticket instead, since a guard on who owns a row should not wait for a feature ticket, and ATS-47 got a line saying it depends on it. The developer also asked to retire the login swap rather than fix a race in a script that has already run. Like ATS-57 for epic 9, the hygiene ticket goes into the next epic's milestone, Epic 10 — Audit log, to be done before ATS-47.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| `ats-create-ticket` resets an existing label's colour with `--force` | ATS-43 | #123 ATS-61, AC3 |
| `npm audit` reports high advisories for `vite` and `zod`, moderate for `typescript-eslint` and `seroval` | ATS-57 | #123 ATS-61, AC4 |
| The deny rules in `.claude/settings.json` have no automated test | ATS-60 | #123 ATS-61, AC5 |
| No test proves that public sign-up is off | ATS-60 | Already fixed in ATS-59 (`e2e/sign-in.spec.ts`) |
| `npx supabase start` restores an old backup, so the end-to-end tests can run on an old schema without a warning | ATS-44 | #123 ATS-61, AC6 |
| A membership written while the same account is promoted to admin can leave an admin as a member | ATS-44 | #123 ATS-61, AC7 |
| `removeCvFolder` had no caller between ATS-44 and ATS-46 | ATS-44 | Already fixed in ATS-46 (`_shared/company-purge.ts`) |
| A member of a deleted company is told their account is deleted at sign-in | ATS-46 | #123 ATS-61, AC8 |
| A user added to a company while it is being deleted can miss the ban | ATS-46 | #123 ATS-61, AC7 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| The deny rules leave remote commands they do not name, and the CLI token readable through a glob, `find` or the keychain | PR #115, ATS-57 | #123 ATS-61, AC5 |
| No end-to-end test shows the open-job counts, and diff mode does not grep embeds across a moved foreign key | PR #118, ATS-44 | #123 ATS-61, AC9 |
| No test for the query cache clear when the user changes, or for the host check in `scripts/local-stack.ts` | PR #117, ATS-60 | #123 ATS-61, AC10 |
| A login swap resumed at "create" or "finish" also runs for a company deleted since the swap began | PR #121, ATS-58 | Dropped: the swap has run on the project and no company shares an id with a login. #123 ATS-61, AC2 retires the script so it can never resume |

### New tickets

- **#123 [ATS-61] Small hygiene fixes from epic 9** — `chore`, `security` and `database`, milestone Epic 10 — Audit log. A card's and an assessment's owner locked like a job's (AC1), the login swap retired and a shared company and login id made impossible (AC2), `ats-create-ticket` without `--force` on existing labels, the `npm audit` advisories, an automated check of the deny rules and their gaps, a warning for an old local schema, one lock design for the admin writes, a `company_deleted` message at sign-in, tests for the open-job counts, the cache clear and the host check, and `profiles.company_name` dropped. #87 ATS-47 now says it depends on AC1.

## Data safety

The full run was made on 13 November 2026 on `28aad96`: the 24 migrations applied to a throwaway Postgres 17, then `rls_test.sql`, which passed (checks 1–59, 65 OK lines). The three concurrency scripts were not run here, since this machine has no `psql`; CI ran them green on the same sha. No 🔴 risk.

What changed in `docs/data-safety.md` since the last full run (2026-11-08, `76607a0`):

- **New gap, 🟡:** a card's `customer_id` is not locked. `authenticated` has an update grant on it, and `applications_1_set_customer` only fires when the job or candidate changes, so an admin or the service role can move a card to another company with one of its columns while the job and candidate stay behind. Shown in a rolled-back transaction: the first company's member then saw no cards. The same holds for an assessment with the service role. Section 10 of `20261109120000_companies.sql` says clients have no grant to change `customer_id`, which is not true for `applications`. → #123 ATS-61, AC1.
- **The login swap has run:** § 1, § 5 and § 6 now say a company and a login no longer share an id on the project, and that ATS-61 AC2 retires the swap. → #123 ATS-61, AC2.
- **Stale rows fixed:** `accounts_due_for_purge()` no longer skips a company's first user (it changed in ATS-46), and `companies_due_for_purge()` and `login_swap_blockers()` were missing from the security definer table. The `applications` row in the grants table now says when the trigger overwrites `customer_id`.
- **§ 7 re-pointed:** every gap that pointed at a `TICKETS.md` line now points at its ATS-61 AC, and the admin-write race from ATS-44, which was only in `TICKETS.md`, is in the table.
- **Gaps closed since the last full run:** a job's or candidate's owner change (ATS-44 AC12, check 55), a customer deleted before ATS-46 staying past the 30 days, and the account dialog writing only `profiles.company_name` (ATS-46 AC10).

## Notes for epic 10

- Do ATS-61 AC1 before ATS-47. The audit triggers take an event's customer from the row, so a card that could change owner would write its history to the wrong company.
- ATS-47 adds triggers on `applications`, which already has four. Name them for their order like `applications_1_` and `_2_`, and add them to check 54.
- ATS-61 AC11 drops a column and AC1 and AC2 add triggers, so the epic starts with three migrations: run each one's dry run on its own, and keep each backwards compatible with the code on `main`.
