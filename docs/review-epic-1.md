# Review of Epic 1 — Accounts and access

Reviewed on 20 October 2026 with `/ats-epic-review`, on `main` at `74a3ba4` (after PR #30). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

Epic 1 is done and epic 2 can start. All four tickets are closed with merged and reviewed PRs, all 24 acceptance criteria are in the code, the security checks hold both in the code and against the live project, and validation passes locally and in CI. There were no blockers.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-5 #27, ATS-6 #28, ATS-7 #29, ATS-8 #30. Every PR uses the template, closes its issue and has a review comment. The ATS-6 review found a real bug (a false sign-out error) and fixed it on the branch |
| Security and RLS | No service role key in `src/`; it is read only in `admin-create-user` through `Deno.env.get`. The role is never read from `user_metadata`: the trigger takes it from `app_metadata`, and the app reads it from `profiles` with zod. RLS is on all 5 tables, with 13 checks in `rls_test.sql`. The function handles `OPTIONS`, checks the token and runs `is_admin()` with the caller's JWT before it reads the body. `DemoLogin` is gone, and `mockStore` is imported only by the data files that epic 2 switches |
| Live project | Public sign-up is off, an anonymous read of `profiles` returns nothing, the function answers `OPTIONS` with 200 and a POST with the anon key with 403 `forbidden`, and the production bundle points to the project |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. Every query key goes through `queryKeys.*` |
| Validation | `npm ci`, lint (0 errors, 8 known warnings), `tsc`, 71/71 tests and the build pass. CI on `main` green, app and RLS jobs |
| Acceptance criteria | 24 of 24 met, each checked in the code. The dashboard steps in ATS-5 (region, first admin) are confirmed by the PR; the region cannot be read through the API |
| Deployment | The route tree has no diff after a build, `.env.example` matches the two variables the code reads, the types are generated, the function is deployed and Vercel is green |

The review itself could not sign in on the production URL. The checkpoint (create a customer as admin, sign in as that customer, the customer cannot open the admin page) is covered by PR #30's manual steps against the real project, and by the developer's own testing on production.

## Warnings and what was done

| Warning | Decision |
|---|---|
| 14 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |
| CI does not run the Deno tests for `admin-create-user` | The same as a finding below: #18 ATS-18, AC7 |
| The CLI migration history is empty | The same as a finding below: #17 ATS-17, AC5 |
| Issues #5–#8 showed every AC box unticked | Ticked |
| Password and field limits are defined in both `src/lib/constants.ts` and `handler.ts` | No action. Edge Functions cannot import from `src/`, and comments in both files point to each other. The one real bug it hides (bytes against characters) is #25 ATS-21, AC9 |

## How the findings were triaged

The same rule as in epic 0: each finding becomes an extra AC on the open ticket that rewrites the same code. Small findings that fit no feature go into the open hygiene ticket from epic 0, #25, instead of a new one. Each AC names where the finding came from. The one finding that changes the schema got its own ticket, because it is security hardening and should not ride along on a feature.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| Explicit table grants instead of Supabase default privileges | ATS-5 | #31 ATS-22 (new ticket) |
| A profile without `full_name` shows an empty name and avatar | ATS-6 | #25 ATS-21, AC5 |
| After login the app always opens `/pipeline` | ATS-6 | #25 ATS-21, AC6 |
| `passwords` and `DEMO_PASSWORD` left in the mock store | ATS-6 | Already fixed in ATS-8 |
| CI does not run `deno check` or `deno test` | ATS-7 | #18 ATS-18, AC7 |
| The account form must use the same minimum password length as the function | ATS-7 | Already fixed in ATS-8 |
| The pipeline search and job filter have no associated `<label>` | ATS-7 | #13 ATS-13, AC6 |
| Error toasts show outside an open dialog | ATS-8 | #25 ATS-21, AC7 |
| `Field` errors are not linked to their input for screen readers | ATS-8 | #9 ATS-9, AC6 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| The CLI migration history is empty; repair it before the first `supabase db push` | PR #27, ATS-5 | #17 ATS-17, AC5 |
| A failed profile load after a correct password leaves the session in place | PR #28, ATS-6 | #25 ATS-21, AC8 |
| `method_not_allowed` is missing from `docs/error-codes.md` | PR #29, ATS-7 | #18 ATS-18, AC8 |
| `MAX_PASSWORD_LENGTH` counts characters, but bcrypt's limit is 72 bytes | PR #30, ATS-8 | #25 ATS-21, AC9 |
| The account form's email check is looser than the function's | PR #30, ATS-8 | #25 ATS-21, AC10 |

### New tickets

- **#31 [ATS-22] Explicit table grants instead of Supabase default privileges** — `chore`, `security`, `database`, milestone Epic 5 — Ready to deliver. Revokes the default privileges and grants each role only what it needs, with matching RLS tests. RLS already protects the data, so this is a second layer, not a fix.
- **#25 [ATS-21]** grew from 4 to 10 ACs and now covers the hygiene findings from epics 0 and 1. Its scope section was updated to name the three visible changes it now includes.

## Notes for epic 2

- Epic 2 switches `jobs`, `candidates` and `applications` from the mock store to Supabase. Every new query needs a two-customer check: customer B must not see or change customer A's rows.
- The trigger codes from ATS-5 (`job_candidate_customer_mismatch`, `application_not_found`) must reach the UI translated, through `toErrorCode`.
- Remove `mockStore.ts` when its last importer is switched, and do not leave half the data layer on mock data at the epic 2 checkpoint.
