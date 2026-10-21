# Review of Epic 3 — Kanban

Reviewed on 21 October 2026 with `/ats-epic-review`, on `main` at `67d6949` (after PR #39). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

Epic 3 is done and epic 4 can start. Both tickets are closed with merged and reviewed PRs, all 12 acceptance criteria are in the code, the security checks hold in the code and against the live project, validation passes locally and in CI, and the repo and the live database match. There were no blockers.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-12 #38, ATS-13 #39. Both PRs use the template, close their issue and have a review comment. The ATS-12 work found and fixed a real bug: a card moved while offline was silently paused instead of rolled back |
| Security and RLS | No service role key in `src/`, no role read from `user_metadata`, and no Supabase calls outside the data layer. The new `move_application` function runs as `security invoker`, so RLS decides access, and is scoped to the active customer. Execute is revoked from `anon`, and RLS checks 7c, 7d, 8c and 9b cover it. RLS is on all 5 tables |
| Live project | The anon key gets `permission denied` from `move_application` |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. The `as Stage` cast on the drop target is replaced by a zod parse. Every query key, and the move's mutation key, includes the customer id |
| Validation | `npm ci`, lint (0 errors, 8 known warnings), `tsc`, 117/117 tests and the build pass. CI on `main` green, app and RLS jobs |
| Acceptance criteria | 12 of 12 met, each checked in the code |
| Deployment | No route tree diff after a build. `npx supabase migration list` shows all 3 migrations on Remote, and the types generated from the project have no diff. Vercel production is green on `67d6949` |

The first epic under the migration rule from the epic 2 close-out: PR #38 applied `move_application` to the project before the merge and regenerated the types. The checkpoint (a customer goes from a new job to a hired candidate on the board) is PR #39's step 7; the developer confirmed it was run on production.

## Warnings and what was done

| Warning | Decision |
|---|---|
| The checkpoint run was not recorded | Confirmed by the developer: run on production |
| 7 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |
| Issue #13 showed its AC boxes unticked, the fourth epic in a row | Ticked. `ats-git-ship` now always asks whether to tick the ACs, and `ats-review-pr` ticks the ✅ ACs when it approves |
| Offline saves hang with no error | The same as a finding below: #40 ATS-24 |
| The board header shows "0 kort" next to the error state | #25 ATS-21, AC23 |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on the open ticket that rewrites the same code, small findings that fit no feature go into the open hygiene ticket, #25, and each AC names where it came from. No open feature ticket touches the board or its tests, so the small findings all went to #25. The offline bug got its own ticket, because it affects every form and should be visible on the board.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| `npx prettier --check src` fails on `src/routes/README.md` | ATS-12 | #25 ATS-21, AC18 |
| The first migration's header says `rls_test.sql` has 13 checks | ATS-12 | #25 ATS-21, AC19 |
| `@testing-library/dom`, the peer of `@testing-library/react`, is missing | ATS-12 | Already in #25 ATS-21, AC12 |
| Every mutation except the card move pauses offline without an error | ATS-12 | #40 ATS-24 (new ticket) |
| Dev server noise from tw-animate-css and `vite-tsconfig-paths` | ATS-12 | #25 ATS-21, AC20 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| No automated test runs two concurrent moves into one column | PR #38, ATS-12 | #25 ATS-21, AC21 |
| The router parses `?q=` before the schema (`1e3`, `12.50`, `true`, `null`) | PR #39, ATS-13 | #25 ATS-21, AC22 |

### New tickets

- **#40 [ATS-24] Make saves fail with an error when offline instead of hanging** — `fix`, milestone Epic 5 — Ready to deliver. Makes `networkMode: "always"` the default for mutations, with a regression test and an offline check of every save.
- **#25 [ATS-21]** grew from 17 to 23 ACs. Its scope now names the two visible changes from epic 3, and it flags that AC20 may remove a dependency.

## Notes for epic 4

- Epic 4 is about the admin acting for a customer. Its checkpoint crosses roles (the admin creates, the customer checks), so write down where it was run and what was seen, in the PR.
- #14 ATS-14 already carries two chooser findings from epic 2 (AC6, AC7). Do them with the switcher, not after it.
- Switching customer must never show the previous customer's cached data, including the board's optimistic moves and the `?job=` filter.
