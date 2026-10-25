# Review of Epic 6 — Extra: AI assessment of CVs

Reviewed on 25 October 2026 with `/ats-epic-review`, on `main` at `a0972d9` (after PR #73). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

The review first said NO-GO, for one reason outside the code: `admin-manage-account` on the project was older than `main`, so ATS-32 AC4 was merged but not live. The developer redeployed `admin-manage-account` and `assess-cv` the same day, the review checked that every function is now newer than its last commit, and the verdict became GO. All 7 tickets are closed with merged and approved PRs, all 45 acceptance criteria are in the code, the security checks hold in the code and against the live project, and validation passes locally and in CI.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-33 #66, ATS-17 #68, ATS-18 #69, ATS-19 #70, ATS-34 #71, ATS-31 #72, ATS-32 #73. Every PR uses the template, closes its issue and has an approving review comment, and every issue has its AC boxes ticked |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. `assess-cv` checks the session before the body, reads the application and downloads the CV with the caller's JWT, and uses the service role only to save the assessment; input and the model's answer are checked with zod, and the prompt tells the model to ignore personal details and treat the CV as data. `purge-deleted-accounts` has no user caller and checks a cron secret in constant time. `soft_delete_or_demote_account` and `accounts_due_for_purge` are executable only by the service role. The API keys are only in Supabase secrets. RLS checks 30 (last admin) and 31 (`cvs` bucket) are new |
| Live project | The anon key gets `permission denied` on all 5 tables, `soft_delete_or_demote_account` and `accounts_due_for_purge`. A signed-out call gets `401` from `assess-cv` and `403` from `admin-manage-account` and `purge-deleted-accounts`. Listing the `cvs` bucket returns nothing |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. Every customer query key goes through `queryKeys.*` |
| Validation | `npm ci`, lint (0 errors, 0 warnings), `tsc`, 326/326 tests and the build pass. CI on `main` green: app, RLS, both concurrency tests, and the new Edge Functions job (`deno check` and `deno test`) |
| Acceptance criteria | 45 of 45 met |
| Deployment | No route tree diff after a build. `npx supabase migration list` shows all 12 migrations on Remote, and the types generated from the project have no diff. `ANTHROPIC_API_KEY` and `PURGE_CRON_SECRET` are set. After the redeploy, all four Edge Functions are newer than their last commit. Vercel production is green on `a0972d9` |

The developer confirmed in the SQL Editor that the nightly purge reaches its function: `net._http_response` shows status 200 at 03:17 UTC on 25 October, which also proves the three Vault secrets are set. The version 2 checkpoint (the Loom demo and the assumptions email) was planned but not yet done at the time of the review.

## Warnings and what was done

| Warning | Decision |
|---|---|
| `admin-manage-account` and `assess-cv` were not redeployed after ATS-32, though PR #73 listed it | Done: the developer redeployed both, and the review checked the versions. A one-off mistake, so no change to `ats-git-ship` |
| The purge through `pg_net` could not be verified by the review | Confirmed by the developer, see above |
| The version 2 checkpoint could not be verified | Planned, not done at review time |
| The CV text goes into the prompt between `<cv>` tags without escaping | #74 ATS-35, AC1 |
| 6 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. Epic 6 is the last epic and no ticket was open, so the hygiene ticket goes into a new milestone, **Backlog — after delivery**, which keeps epics 0–6 closed and shows the work is known. Product ideas for after the delivery join that milestone as tickets once they are decided. Two findings were dropped because they only cost a little and never give wrong data.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| An edit that saves the customer role still demotes through the ATS-28 role trigger without the last-admin lock | ATS-33 | #74 ATS-35, AC5 |
| The CV field in the candidate dialog is unclear when a CV exists | ATS-19 | Already fixed in ATS-32 (#63, AC3) |
| `beforeEach` returning a mock reset runs it as cleanup after every test | ATS-31 | Already fixed in ATS-32 (#63, AC6) |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| When an Auth call and its undo both fail, the Auth error never reaches the log | PR #66, ATS-33 | Already fixed in ATS-32 (#63, AC4) |
| A failed candidate delete can leave a `cv_path` to a removed file | PR #68, ATS-17 | #74 ATS-35, AC2 |
| Two `assess-cv` calls at once can both pass the one-minute cooldown | PR #69, ATS-18 | Dropped: the cooldown only guards cost; the worst case is one extra model call, never wrong data |
| The `SYSTEM_PROMPT` comment promises prompt caching that does not happen | PR #69, ATS-18 | Already fixed in ATS-32 (#63, AC5) |
| An old assessment is not marked as made from a replaced CV | PR #70, ATS-19 | #74 ATS-35, AC4 |
| One extra `getUser` request on every page change | PR #71, ATS-34 | Dropped: cheap and fails safe; revisit only if it shows up in Auth rate limits |
| No test covers when the reject prompt opens on the board | PR #72, ATS-31 | Already fixed in ATS-32 (#63, AC7) |
| The "Öppna" link in the CV field has no loading or error state | PR #73, ATS-32 | #74 ATS-35, AC3 |

### New tickets

- **#74 [ATS-35] Small hygiene fixes from epic 6** — `chore`, milestone Backlog — after delivery. Escaping the CV and job text in the `assess-cv` prompt, no `cv_path` left after a failed candidate delete, a loading and error state for the CV link, marking an assessment made from a replaced CV, and the last-admin lock for a demotion through the role trigger.

## Notes after delivery

- Every epic is closed. New work goes into Backlog — after delivery, through `/ats-create-ticket`, and follows the same rules: a PR per ticket, migrations applied before the merge, and changed Edge Functions deployed after it.
- Production is what the reviewers use. Before recording the version 2 demo, check that production matches `main`, Edge Functions included.
- AC1 of #74 is the one with a security angle (prompt hardening). Do it first if the AI feature gets more use.
