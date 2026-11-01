# Review of Epic 7 — Safety net

Reviewed on 1 November 2026 with `/ats-epic-review`, on `main` at `0944937` (after PR #98). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

All 3 tickets are closed with merged PRs that use the template. The security checks hold, validation passes locally and in CI, and the epic's checkpoint is met: the End-to-end tests job is green on `main` and required before a merge. One acceptance criterion, ATS-35 AC2, is met only partly. Its PR said so in the tradeoffs, and the rest of the work is now AC1 of the epic 7 hygiene ticket.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-35 #96, ATS-36 #97, ATS-37 #98. Every PR comes from an `ats/ATS-<N>-…` branch, uses the template and closes its issue. PR #96 ticks AC2 as done although its own tradeoffs call it partial; issue #74 leaves it unticked, which is the accurate record |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. Supabase is called only from the data layer and auth. All 5 tables have RLS, and checks 32–34 cover the ATS-35 migrations. The three browser-facing Edge Functions handle `OPTIONS` and check the caller; `purge-deleted-accounts` is called only by cron with a secret. The end-to-end seed and fixtures use the local stack's fixed service-role key, and `scripts/local-stack.ts` refuses any host that is not `127.0.0.1` or `localhost` |
| Code quality | No TODO, `console.log`, `any` (outside the generated route tree), raw colours, arbitrary sizes or hardcoded text. Every customer query key goes through `queryKeys.*` |
| Validation | `npm ci`, lint, `tsc`, 335/335 tests and the build pass. CI on `main` is green: app, Edge Functions, RLS and End-to-end tests |
| Acceptance criteria | 19 of 20 met; ATS-35 AC2 partly (`src/lib/api/candidates.ts:127`: if both the delete and the `cv_path` clear fail, the path to a removed file stays) |
| Checkpoint | A ruleset on `main` (active, no bypass) requires End-to-end tests, the app job, the Edge Functions job and the RLS tests |
| Deployment | No route tree diff after a build. `.env.example` lists both `VITE_*` variables the app reads. Vercel production is green on `0944937`. The developer redeployed `assess-cv` from `main` on 1 November, after the review |

Not verified by the review: `npx supabase migration list` and the types generated from the project, because Claude does not run the Supabase CLI against the project. ATS-36 and ATS-37 added no migrations, and PR #96 records that all four ATS-35 migrations were pushed and the regenerated types had no diff.

## Warnings and what was done

| Warning | Decision |
|---|---|
| ATS-35 AC2 is met only partly | Already in the findings list from PR #96; #99 ATS-56, AC1 |
| The `assess-cv` redeploy after ATS-35 was not confirmed | Done: the developer deployed `assess-cv` from `main` on 1 November, and the box is ticked on #74 |
| PR #96 ticks AC2 although its tradeoffs say partial | No action: a merged PR is history, and the issue has the right state |
| Security rule 1 does not name `e2e/fixtures.ts`, which also uses the local service-role key | #99 ATS-56, AC5 |
| `e2e/admin.spec.ts` closes the customer's browser context only when the test passes | #99 ATS-56, AC8 |
| 7 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. No open epic 8 ticket touches the candidate delete, `assess-cv` or the e2e admin test. ATS-42 edits `CLAUDE.md`, but it is the last ticket of epic 8 and the docs should be right while epic 8 is built, so the `CLAUDE.md` findings go into the hygiene ticket too. Like ATS-35 for epic 6, the hygiene ticket goes into the next epic's milestone, Epic 8 — Own pipeline stages. Nothing was dropped.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| `ats-git-ship` does not run `npm run test:e2e` or the Deno checks in its validation step | ATS-36 | #99 ATS-56, AC4 |
| Security rule 2 does not document that `purge-deleted-accounts` has no caller and reads with the service role | ATS-36 | #99 ATS-56, AC5 |
| § Reference docs calls `TICKETS.md` "the original plan" and does not list `docs/next-custom-stages.md`, `docs/next-branding.md` or `docs/error-codes.md` | ATS-36 | #99 ATS-56, AC6 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| A candidate and its CV file are not deleted in one server-side step | PR #96, ATS-35 | #99 ATS-56, AC1 |
| `assess-cv` saves its assessment without checking that the candidate still has a CV | PR #96, ATS-35 | #99 ATS-56, AC2 |
| A recruiter cannot remove an AI assessment without removing the CV | PR #96, ATS-35 | #99 ATS-56, AC3 |
| `CLAUDE.md` § Workflow allows read-only `npx supabase` commands, but `ats-implement-ticket` forbids even those | PR #97, ATS-36 | #99 ATS-56, AC7 |

### New tickets

- **#99 [ATS-56] Small hygiene fixes from epic 7** — `chore` and `security`, milestone Epic 8 — Own pipeline stages. A candidate and their CV deleted in one server-side step, `assess-cv` checking the CV is still there before it saves, a server-side delete of an AI assessment, the end-to-end and Deno checks in `ats-git-ship`, `CLAUDE.md` brought up to date (security rule exceptions, reference docs, the Supabase CLI rule), and the e2e browser context always closed.

## Notes for epic 8

- The end-to-end tests find columns by the fixed stage keys (`column(page, "new")` in `e2e/fixtures.ts`). ATS-39 AC5 moves the tests to the new shape; plan the helper change into that ticket instead of meeting it as a red CI run.
- End-to-end tests is now a required check. A stage migration that breaks the local stack, or the seed in `scripts/seed-shared.ts`, blocks every merge, so run `npm run test:e2e` before shipping each epic 8 ticket.
- Every epic 8 migration before ATS-42 must still work with `v1.0-submission`, since both deployments share the Supabase project.
