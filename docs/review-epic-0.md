# Review of Epic 0 — Foundation

Reviewed on 19 October 2026 with `/ats-epic-review`, on `main` at `60e29fa` (after PR #24). This file records the result, what was decided afterwards, and where every open finding went, so the step from epic 0 to epic 1 can be followed.

## Verdict: GO

Epic 0 is done and epic 1 can start. All five tickets are closed with merged PRs, the security and code quality checks are clean, and validation passes locally and in CI.

The first verdict was NO-GO for one reason only: the CI run on `main` for the PR #24 merge (run 39280439777) sat in GitHub's queue. It then finished green (app and RLS jobs), and the verdict became GO. No code had to change.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-1 (done in Lovable, no PR by design), ATS-2 #20, ATS-3 #21, ATS-4 #23, ATS-20 #24. Every PR uses the template and closes its issue |
| Security and RLS | No service role key in `src/`, no `user_metadata`, no Supabase calls outside the data layer, RLS on all 5 tables with tests, no secrets committed. No Edge Functions yet |
| Code quality | No TODO, `console.log`, raw colours, arbitrary sizes or hardcoded text. `as any` only in the generated route tree. Every customer query key goes through `queryKeys.*(customerId)` |
| Validation | `npm ci`, lint (0 errors, 8 known warnings), `tsc`, 54/54 tests and the build pass. CI on `main` green |
| Acceptance criteria | 26 of 26 met, each checked in the code |
| Deployment | Production on Vercel answers in Swedish and English (`<html lang>` follows the cookie), `/pipeline` reloads, unknown paths return 404. The route tree has no diff after a build |

The review itself checked production with `curl` only. The developer has clicked through the production site as admin and as customer throughout the epic, and the PRs record the same runs against `npm run dev` and the preview builds.

## Warnings and what was done

| Warning | Decision |
|---|---|
| 11 open findings in `TICKETS.md` were not ticketed | Triaged, see below. The lists are now empty |
| One finding pointed at a file that ATS-20 moved | Fixed in the ticket that took it over (#8) |
| Issue #22 (ATS-20) had its AC boxes unticked | Ticked |
| PR #20 (ATS-2) has no review comment | Left as it is. The PR is merged and there is nothing to fix |
| 8 `react-refresh` lint warnings | Part of the triage below (#25) |

## How the findings were triaged

Ten separate tickets for one-line fixes would cost more in branches and reviews than the fixes themselves. So each finding became an extra AC on the open ticket that already rewrites the same code. The four that fit no feature went into one hygiene ticket. Each AC says where the finding came from, and the lines were removed from `TICKETS.md`. That is now the rule for every epic checkpoint, written in `TICKETS.md` and `CLAUDE.md`.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| The candidate dialog shows existing job links as unchecked and enabled until the applications have loaded | ATS-2 | #10 ATS-10, AC6 |
| Disabled job checkboxes are dimmed but their titles are not | ATS-2 | #10 ATS-10, AC7 |
| A hand-typed `?q=123` is parsed as a number and dropped by the search schema | ATS-2 | #13 ATS-13, AC5 |
| 8 `react-refresh/only-export-components` lint warnings | ATS-2 | #25 ATS-21, AC1 |
| The jobs table's last column has no header for screen readers | ATS-3 | #9 ATS-9, AC5 |
| `AccountDialog` casts the role with `v as Role` instead of parsing it with zod | ATS-3 | #8 ATS-8, AC5 |
| Database triggers raise Swedish text | ATS-3 | Already in #5 ATS-5, AC4b |
| The LinkedIn error was misleading for `https://linkedin.com` | ATS-2 | Already fixed in ATS-3 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| The server error page puts translations into HTML without escaping | PR #21, ATS-3 | #25 ATS-21, AC2 |
| The `lang` cookie has no `Secure` flag | PR #21, ATS-3 | #25 ATS-21, AC3 |
| The size-token test skips token kinds it does not know | PR #23, ATS-4 | #25 ATS-21, AC4 |
| Mock dates use `86_400_000` inline instead of `MS_PER_DAY` | PR #23, ATS-4 | Dropped: `mockStore.ts` is removed when Supabase replaces the mock data in epics 1–2 |
| Two constants lived outside `src/lib/constants.ts` | PR #21, ATS-3 | Already fixed in ATS-4 |

### New ticket

- **#25 [ATS-21] Small hygiene fixes from epic 0** — `chore`, milestone Epic 5 — Ready to deliver. It holds the four findings that belong to no feature.

## Notes for epic 1

- Epic 1 replaces the mock data with Supabase and adds the first Edge Function. Grow `supabase/tests/rls_test.sql` with every migration, and check every Edge Function for the caller check and `OPTIONS` handling.
- Run the epic 1 checkpoint in a browser on the production URL, not only on `npm run dev`.
- Keep the findings lists short between checkpoints: one line per finding, triaged as above at the next review.
