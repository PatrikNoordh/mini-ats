# Review of Epic 2 — Jobs and candidates

Reviewed on 20 October 2026 with `/ats-epic-review`, on `main` at `eb34a56` (after PR #35). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

Epic 2 is done and epic 3 can start. All three tickets are closed with merged and reviewed PRs, all 16 acceptance criteria are in the code, the mock store is gone, the security checks hold in the code and against the live project, and validation passes locally and in CI. There were no blockers.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-9 #33, ATS-10 #34, ATS-11 #35. Every PR uses the template, closes its issue and has a review comment. The ATS-9 review found a real bug (candidate links to Supabase jobs were dropped silently) and fixed it on the branch with a test |
| Security and RLS | No service role key in `src/`, and no role read from `user_metadata`. Supabase is called only from the data layer and auth. `mockStore.ts` is deleted, with no importers left. The client never sends `customer_id` for `applications`: the trigger sets it from the job, and the new migration gives the column a default so the generated types agree. RLS checks 7b and 8b cover this. RLS is on all 5 tables |
| Live project | Anonymous reads of `jobs`, `candidates`, `applications` and `cv_assessments` return nothing |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. Every query key goes through `queryKeys.*` |
| Validation | `npm ci`, lint (0 errors, 8 known warnings), `tsc`, 100/100 tests and the build pass. CI on `main` green, app and RLS jobs |
| Acceptance criteria | 16 of 16 met, each checked in the code |
| Deployment | The route tree has no diff after a build, `.env.example` is unchanged and still matches the code, and Vercel production is green on `eb34a56` |

The checkpoint (customer B sees none of customer A's jobs, candidates or cards) is covered by PR #35's manual steps, RLS check 2 and the live anonymous probes. Not verified: whether the ATS-10 migration `20261020000000_applications_customer_default.sql` is applied to the live project. PR #34 says it still needs to be applied, and the API does not show column defaults to the anon key. The app works either way, because the trigger sets `customer_id` before the NOT NULL check.

## Warnings and what was done

| Warning | Decision |
|---|---|
| 10 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |
| The ATS-10 migration may not be on the live project, and `types.ts` was changed by hand to match it | #17 ATS-17, AC6: push it after the migration repair in AC5 and regenerate the types from the project |
| Issue #11 showed its AC boxes unticked | Ticked |
| `moveApplication` reads the next position and then writes it, so two quick moves into the same column can get the same `position` | #12 ATS-12, AC6 |
| The customer chooser loads every job of every customer just to show a count | #14 ATS-14, AC7 |

## How the findings were triaged

The same rule as in epics 0 and 1: each finding becomes an extra AC on the open ticket that rewrites the same code, and small findings that fit no feature go into the open hygiene ticket, #25. Each AC names where the finding came from. The one finding that changes the schema got its own ticket, as in epic 1.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| The customer chooser shows "…" forever when a customer's jobs fail to load | ATS-9 | #14 ATS-14, AC6 |
| An invalid field is only marked with `aria-invalid`, with no error border on the input | ATS-9 | #25 ATS-21, AC11 |
| `@testing-library/react` is installed without its peer `@testing-library/dom` | ATS-9 | #25 ATS-21, AC12 |
| The candidates table's job count shows "…" forever when the applications fail to load | ATS-10 | #25 ATS-21, AC13 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| `isValidationKey` uses `in`, which also matches inherited keys like `"constructor"` | PR #33, ATS-9 | #25 ATS-21, AC14 |
| `fieldErrors` returns `Record<string, ValidationKey>`, so a wrong field name is not caught by the type check | PR #33, ATS-9 | #25 ATS-21, AC15 |
| Job lengths are only limited in the client; `jobs` has no `char_length` checks | PR #33, ATS-9 | #36 ATS-23 (new ticket) |
| A long location without spaces widens the jobs table | PR #33, ATS-9 | #25 ATS-21, AC16 |
| `docs/ui-spec.md` still describes the mock store that ATS-10 removed | PR #34, ATS-10 | #15 ATS-15, AC5 |
| `saveCandidate` is plain logic exported from a hooks file | PR #34, ATS-10 | #25 ATS-21, AC17 |

### New tickets

- **#36 [ATS-23] Length checks in the database for job and candidate text** — `chore`, `database`, milestone Epic 5 — Ready to deliver. Adds `char_length` checks to the text columns of `jobs` and `candidates` with the same limits as `src/lib/constants.ts`, with RLS tests. No table had length checks, so the ticket covers candidates too.
- **#25 [ATS-21]** grew from 10 to 17 ACs. Its scope now names the three visible changes from epic 2, and it flags that AC12 may need approval for a dev dependency.

## Notes for epic 3

- Epic 3 makes drag and drop real. Design the stage change and the card position as one database call (#12 ATS-12, AC6) instead of patching it afterwards.
- Repair the CLI migration history (#17 ATS-17, AC5) early, so the ATS-10 migration and any epic 3 migration go through `supabase db push`, not the SQL Editor.
- Every new query on the board still needs the two-customer check, including the admin acting for a customer.
