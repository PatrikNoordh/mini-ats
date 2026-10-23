# Review of Epic 5 — Ready to deliver

Reviewed on 23 October 2026 with `/ats-epic-review`, on `main` at `5384f9e` (after PR #61). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

Epic 5 is done and version 1 is with the reviewers. All 12 tickets are closed with merged PRs, all 96 acceptance criteria are in the code, the security checks hold in the code and against the live project, validation passes locally and in CI, and all migrations and Edge Functions on the project match the repo. There were no blockers.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-21 #46, ATS-26 #47, ATS-24 #48, ATS-25 #49, ATS-22 #50, ATS-23 #51, ATS-15 #53, ATS-28 #55, ATS-27 #56, ATS-29 #58, ATS-16 #60, ATS-30 #61. Every PR uses the template and closes its issue, and every issue has its AC boxes ticked. Eleven PRs have an approving review comment; #58 has none |
| Security and RLS | No service role key in `src/`; outside the Edge Functions it is only read by the local seed script, from the shell or a gitignored file. No role read from `user_metadata`: roles go through `app_metadata` and the ATS-28 trigger, which accepts only `admin` and `customer`. `anon` has no table privileges and `authenticated` only what the app uses (ATS-22). A deleted account gets no rows and a deleted admin is not an admin (ATS-27). `purge_deleted_accounts` is revoked from clients. `admin-manage-account` checks `is_admin()` with the caller's JWT before reading the body and uses the service role only for the account writes. RLS checks 14–29 cover the epic's changes. The demo data uses only `.test` emails and fiction phone numbers |
| Live project | The anon key gets `permission denied` on all 5 tables and on `purge_deleted_accounts`. A signed-out POST to either Edge Function gets `403 forbidden` |
| Code quality | No TODO, `any`, raw colours, arbitrary sizes or hardcoded text. `console.log` only in the seed script's CLI output. Every customer query key goes through `queryKeys.*` |
| Validation | `npm ci`, lint (0 errors and, after ATS-21, 0 warnings), `tsc`, 251/251 tests and the build pass. CI on `main` green: app, RLS and the concurrent move test |
| Acceptance criteria | 96 of 96 met. Two differ from their wording on purpose: ATS-26 AC1 uses `on delete no action` instead of `restrict` (the same refusal, explained in the migration), and ATS-24 AC1 sets the mutation default in `src/lib/query-client.ts` instead of `src/router.tsx` |
| Deployment | No route tree diff after a build. `npx supabase migration list` shows all 9 migrations on Remote, and the types generated from the project have no diff. Both Edge Functions are deployed after their last code change. Vercel production is green on `5384f9e` |

The developer confirmed in the SQL Editor that the `purge-deleted-accounts` cron job is scheduled (`17 3 * * *`, active), and that the version 1 checkpoint was done: the app is deployed and the reviewer has the logins and the repo link.

## Warnings and what was done

| Warning | Decision |
|---|---|
| PR #58 (ATS-29, the logo) was merged without a review comment | No action: a merged PR. Recorded here |
| The pg_cron schedule and the version 1 checkpoint could not be verified by the review | Both confirmed by the developer, see above |
| 6 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |
| The last-admin check counts and then writes | The same as a finding below: #64 ATS-33 |

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on the open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. Version 1 is shipped, so Epic 5 holds exactly what was delivered: everything new goes to Epic 6, the work before version 2. The only open tickets were the three CV tickets, so two findings got their own tickets.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| Moving a card to Hired leaves the candidate's other open cards as they are | ATS-30 | #62 ATS-31 (new ticket) |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| `initials()` splits real names on `-`, so "Anna-Lena Svensson" gives AL | PR #46, ATS-21 | #63 ATS-32, AC1 |
| `utf8Length` has no comment pointing to its twin in `src/lib/validation.ts`, and is copied in both Edge Functions | PR #46, ATS-21 | #63 ATS-32, AC2 |
| `admin-create-user` must be deployed at merge for the byte limit to be checked on the server | PR #46, ATS-21 | Already fixed: deployed on 21 October, after the fix |
| The last-admin check counts and then writes, so two admins removing each other at once can leave no admin | ATS-27 branch review | #64 ATS-33 (new ticket) |
| Deleting an account for good leaves its CV files in Storage | ATS-27 branch review | #17 ATS-17, AC7 |

### New tickets

- **#62 [ATS-31] Offer to reject a hired candidate's other open applications** — `feat`, milestone Epic 6. A soft prompt after a move to Hired; the candidate's other open cards move to Rejected only on a yes.
- **#63 [ATS-32] Small hygiene fixes from epic 5** — `chore`, milestone Epic 6. Initials for hyphenated names, and one shared `utf8Length` for the Edge Functions.
- **#64 [ATS-33] Make the last-admin check safe against two admins at once** — `fix`, `security`, `database`, milestone Epic 6. Holds the check and the write in one locked database function, run only with the service role, with a concurrency test in CI.
- **#17 [ATS-17]** grew from 6 to 7 ACs: deleting an account for good also removes its CV files.

## Notes for epic 6

- The reviewers now use production, so every merge reaches them at once. Test each PR on its Vercel preview before merging; `main` stays the only branch that deploys, because there is one Supabase project and a separate branch would not keep the reviewers' data apart.
- `assess-cv` is the first function to download files and call an LLM. Build it like `admin-manage-account`: caller checked first with the caller's JWT, the CV downloaded with that JWT, and the service role used only to save the assessment.
- Do #64 ATS-33 early: it is a migration and a function deploy, and it is easier before the CV work adds more to the account delete.
