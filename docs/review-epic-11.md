# Review of Epic 11 — Email

Reviewed on 18 November 2026 with `/ats-epic-review`, on `main` at `bb49c3f` (after PR #138). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

All 4 tickets are closed with merged PRs that use the template. 19 acceptance criteria are in the code, and 2 were left out by decisions recorded on their issues. The security checks hold, CI on `main` is green on all four jobs, and the full validation passes locally. Nothing was a blocker.

ATS-64 (zod 4) was in the Epic 11 milestone. The developer moved it to Epic 12, to be done last there, so that epic 11 could close (comment on #132).

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-63 #138, ATS-49 #134, ATS-50 #136, ATS-51 #137. Every PR comes from an `ats/ATS-<N>-…` branch, uses the template, closes its issue and names the UI by its English text. #135 is a README follow-up to ATS-49 that closes no issue |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. No new table and no new Edge Function. The one migration renames `login_swap_blockers()` to `company_data_user_references()`, with the same body and grants, service role only (check 58). Invite and resend run inside `admin-create-user` and `admin-manage-account`, after their admin check. The invite and reset links open the app's own pages and are used only when the form is sent, so an email scanner cannot use them up. **Forgot password?** gives the same answer for every address, also when Auth refuses a repeat request. A deleted account, or a member of a deleted company, has its link refused through the login ban. No SMTP settings are committed, and a unit test fails if any are |
| Code quality | No TODO, `console.log`, `any` (outside the generated route tree), raw colours in `src/`, arbitrary sizes or hardcoded text. The email templates write the theme tokens out as hex, since email clients cannot read CSS variables; `docs/auth-email.md` says so |
| Validation | `npm ci`, lint, `tsc`, 888/888 tests in 78 files and the build pass. CI on `main` is green on `bb49c3f`: app, Edge Functions, RLS and end-to-end tests |
| Acceptance criteria | 19 met. ATS-49 AC1 (custom SMTP) was not done by decision: email stays off in production, and Brevo is the documented choice for the day it is switched on. ATS-50 AC2 (a company invites its own members) was struck by decision: it would let any member add users without an owner role, against security rule 3 |
| Checkpoint | On the local stack, by decision in ATS-49. Covered by two end-to-end tests: `e2e/invite.spec.ts` (an invited user accepts, lands on the board and signs in again) and `e2e/reset-password.spec.ts` (**Forgot password?** through to signing in with the new password), on different accounts |
| Deployment | No route tree diff after a build. `.env.example` lists the new `VITE_EMAIL_ENABLED`. The developer regenerated the types from the project: no diff after formatting. `functions list` shows `admin-create-user` and `admin-manage-account` deployed 2026-11-18 21:57 UTC, after their last change at 21:31 UTC; the other four functions did not change in this epic. PR #138 records the migration's dry run, push and `rls_test.sql` run in the SQL Editor |

Not verified at the time of this report: the last row of `migration list --remote` (the developer's screenshot ended at an earlier migration; PR #138 records the push), the Vercel production deployment of `bb49c3f`, the Auth settings in the project's dashboard (redirect URLs and secure email change, `docs/auth-email.md`), and the checkpoint run by hand on the local stack. #139 ATS-65 AC2 turns the checkpoint into one end-to-end test.

## Warnings and what was done

| Warning | Decision |
|---|---|
| `TICKETS.md` listed ATS-64 under Epic 11, but #132 is in Epic 12 | Done now: the entry moved to Epic 12 in this close-out |
| The checkpoint is not one chained test: invite and reset run on different accounts | #139 ATS-65, AC2 |
| 390 px not checked by hand on **Forgot password?**, the reset page and the accept-invite page | #139 ATS-65, AC3 |
| zod's high advisory is still in `npm audit` | Already in #132 ATS-64 |
| One line in the `TICKETS.md` findings lists | Triaged, see below. The lists are now empty |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. No open ticket in epic 12 (a customer's own theme) touches the README, the email pages or the invite flow, so no finding became an extra AC. Like ATS-63 for epic 11, the hygiene ticket goes into the next epic's milestone, Epic 12 — A customer's own theme, to be done first.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| The README's out-of-scope list and Assumptions still say one login per company and no audit log | ATS-50 | #139 ATS-65, AC1 |

### Found while reviewing PRs

None.

### New tickets

- **#139 [ATS-65] Small hygiene fixes from epic 11** — `chore`, milestone Epic 12 — A customer's own theme. The README brought up to date, one end-to-end test of the whole epic 11 checkpoint, the three email pages checked at 390 px, and the way back from a half-accepted invite written down.

## Data safety

The full run was made on 18 November 2026 on `bb49c3f`: the 30 migrations applied to a throwaway Postgres 17, then `rls_test.sql`, which passed (checks 1–66, 72 OK lines), and the four concurrency scripts (`move_application`, `last_admin`, `pipeline_stages`, `membership`), which passed in the same database. No 🔴 risk.

The schema matched the map: every foreign key, RLS flag, table grant, policy, security definer function and trigger. The epic 11 PRs had already updated it in diff mode: the invite and reset guards in § 3, the admin functions' invite step in § 2, the audit log's retention and the account update's order in § 5, and the rename. This run changed only the header and § 7 of `docs/data-safety.md`:

- **New gap, 🟡:** a half-accepted invite. The accept-invite page confirms the account before it saves the password. If the save fails and the user leaves, the account is confirmed without a password, and **Resend invite** answers `invite_accepted`. The admin can set a password in the account dialog, but this is not written down. → #139 ATS-65, AC4.
- **Unchanged, 🟢:** the deny rules cannot see a path built at run time (ATS-61 AC5), and the two ATS-61 lock races (accepted at the epic 10 close-out).
- **Gaps closed since the last full run:** the half-done account update with `company_deleted` (ATS-63 AC1, `saved_not_moved`) and the audit log without a retention decision (ATS-63 AC3: kept for the company's lifetime).

## Notes for epic 12

- Do #139 ATS-65 first, and #132 ATS-64 (zod 4) last, as decided.
- ATS-52 adds a table and a Storage bucket for logos and backgrounds. It needs RLS by `current_company_id()`, explicit grants, and Storage policies by company folder like `cvs`. A company's delete and purge must take its branding files with it (`_shared/company-purge.ts`), or they become files no row points at.
- The Auth settings and, once email is on, the SMTP settings and templates live in the Supabase dashboard, where CI cannot see them. Re-check "Project settings that apply now" in `docs/auth-email.md` at the epic 12 close-out.
