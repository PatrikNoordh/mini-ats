# Review of Epic 4 — Admin acting for a customer

Reviewed on 21 October 2026 with `/ats-epic-review`, on `main` at `6434822` (after PR #42). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

Epic 4 is done and epic 5 can start. Its one ticket is closed with a merged and approved PR, all 7 acceptance criteria are in the code, the security checks hold, validation passes locally and in CI, and the repo and the live database still match. There were no blockers.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-14 #42. The PR uses the template, closes its issue and has an approving review. It fixed a real bug: switching A → B → A reopened A's side panel, now prevented by remounting the page on a switch, with a test that fails without the fix |
| Security and RLS | No service role key in `src/`, no role read from `user_metadata`, and the new count query is in the data layer. Writes use the active customer's id and RLS (`is_admin()`) still decides access, so the picker is UX, not access control. A customer always acts as themselves and never sees the picker. No schema change |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. The new `openJobCounts()` key has no customer id on purpose: it is admin-only, holds every customer's count, and is cleared on logout |
| Validation | `npm ci`, lint (0 errors, 8 known warnings), `tsc`, 125/125 tests and the build pass. CI on `main` green, app and RLS jobs |
| Acceptance criteria | 7 of 7 met, each checked in the code, including the two epic 2 findings (AC6, AC7) |
| Deployment | No route tree diff after a build. `npx supabase migration list` shows all 3 migrations on Remote. Vercel production is green on `6434822` |

The checkpoint (as admin, create a job and a candidate for customer A, then log in as A and see them) is PR #42's step 3; the developer confirmed it was run on production. The AC boxes on #14 were ticked by the review, the first epic under the ticking rule from the epic 3 close-out.

## Warnings and what was done

| Warning | Decision |
|---|---|
| The checkpoint's environment was not recorded in the PR | Confirmed by the developer: run on production |
| An admin's chosen customer is lost on every reload, so `?job=` links do not work for admins | #43 ATS-25 (new ticket), AC1–AC3 |
| The header picker opens empty with no error when the customer list fails | #43 ATS-25, AC4 |

## How the findings were triaged

The same rule as in the earlier epics. Both `TICKETS.md` findings lists were already empty, because ATS-14 logged nothing outside its scope, so only the review's warnings were triaged. The reload problem got its own ticket because it is a behaviour bug the reviewers will meet as admins. The picker's error state lives in the same file, so it rides along as an extra AC on that ticket.

### Found while building

No findings.

### Found while reviewing PRs

No findings.

### New tickets

- **#43 [ATS-25] Keep an admin's chosen customer across reloads** — `fix`, milestone Epic 5 — Ready to deliver. Keeps the chosen customer per tab, ignores a stored id the admin can no longer see, clears it on logout, and gives the header picker an error state.

## Notes for epic 5

- Epic 5 is the delivery epic: demo data (#15), the README (#16) and the open fixes and hygiene work (#25, #31, #36, #40, #43). Do #43 and #40 before the reviewers get their accounts, since both are things they would notice.
- #31 ATS-22 and #36 ATS-23 change the schema. Follow the migration rule in `CLAUDE.md` § Workflow, and run `rls_test.sql` in the SQL Editor against the project.
- The version 1 checkpoint goes to the reviewers, so run it on production and write down what was checked.
