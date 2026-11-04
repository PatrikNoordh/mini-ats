# Review of Epic 8 — Own pipeline stages

Reviewed on 4 November 2026 with `/ats-epic-review`, on `main` at `410165f` (after PR #106). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO

All 6 tickets are closed with merged PRs that use the template. The security checks hold, validation passes locally and in CI, and the project runs the same migrations and Edge Functions as `main`. One acceptance criterion, ATS-56 AC1, is met only partly: the candidate delete is one server-side call now, but its clean-up after a failed delete is still a best effort. That leftover is accepted, and ATS-57 AC6 corrects the comments that overstated it.

## What was checked

| Area | Result |
|---|---|
| Tickets and PRs | ATS-38 #101, ATS-39 #102, ATS-56 #103, ATS-40 #104, ATS-41 #105, ATS-42 #106. Every PR comes from an `ats/ATS-<N>-…` branch, uses the template, closes its issue and says which migrations were applied before the merge |
| Security and RLS | No service role key in `src/` and no role read from `user_metadata`. The new `pipeline_stages` table has RLS, column-level grants and checks 35–50; the new `cv_assessments` delete policy has check 44. `reset_stages` is security definer and checks the caller with the table policy's rule; `set_application_start_stage` picks only the card's own customer's columns, and the foreign key on `(stage_id, customer_id)` refuses another customer's. The new `delete-candidate` Edge Function reads the candidate with the caller's JWT, takes its folder from the row, not the request, and uses no service role |
| Code quality | No TODO, `console.log`, `any`, raw colours, arbitrary sizes or hardcoded text. The eight new error codes are translated in both languages. The new `stages` query key goes through `queryKeys.stages(customerId)` |
| Validation | `npm ci`, lint, `tsc`, 375/375 tests and the build pass. CI on `main` is green: app, Edge Functions, RLS with `pipeline_stages_concurrency.sh`, and End-to-end tests, all four required by the ruleset |
| Acceptance criteria | 34 of 35 met; ATS-56 AC1 partly (`supabase/functions/delete-candidate/handler.ts:85-93`). ATS-38 AC2 uses `on delete no action` instead of `restrict`, and ATS-40 AC4 words the reset hint differently; both are documented in their PRs and meet the AC's intent |
| Checkpoint | The customer half is covered end to end in `e2e/stages.spec.ts` (rename, add, reset, reorder, 390 px). The admin half was tested by the developer on the PR #106 preview, with no end-to-end test |
| Deployment | No route tree diff after a build. `.env.example` lists both `VITE_*` variables the app reads. Vercel production is green on `410165f`, and `mini-ats-submission.vercel.app` returns 404. The developer ran `migration list` (all 21 migrations on Remote) and `functions list` (all 5 functions, `delete-candidate` included, deployed after their last code change) with the CLI pinned to 2.122.0 |

Not verified by the review: the types generated from the project, because Claude does not run the Supabase CLI against the project. PR #106 records that the types were regenerated after the drop and committed.

## Warnings and what was done

| Warning | Decision |
|---|---|
| ATS-56 AC1's leftover, and comments that say a candidate "never points at a removed file" | #107 ATS-57, AC6: the leftover is accepted and the comments corrected |
| The admin half of the checkpoint has no end-to-end test | #107 ATS-57, AC7 |
| Production's migrations and Edge Functions could not be verified by the review | Already fixed: the developer checked both the same day, see Deployment above |
| #99 ATS-56 had its Edge Cases and Definition of Done boxes unticked | Already fixed: all boxes were ticked by the time of the close-out |
| 5 open findings in `TICKETS.md` | Triaged, see below. The lists are now empty |

From the review's senior notes: `reset_stages` copies the table policy's ownership check by hand, and `set_application_start_stage` depends on triggers firing in name order. Both have to change when Teams changes what `customer_id` means, so they went to #86 ATS-43, AC4.

## How the findings were triaged

The same rule as in the earlier epics: a finding becomes an extra AC on an open ticket that touches the same code, small findings go into one hygiene ticket, and each AC names where it came from. No open ticket touches the board, the candidate dialog, the column names or the tooling, so these go into the hygiene ticket. Like ATS-56 for epic 7, it goes into the next epic's milestone, Epic 9 — Teams, to be done before the Teams rewrite. The upgrade to Supabase CLI v3 is not a ticket yet: ATS-57 AC2 pins 2.122.0 and writes down what the upgrade needs, so it can be planned when something needs v3. Nothing was dropped.

### Found while building

| Finding | Found in | Moved to |
|---|---|---|
| Screen readers hear dnd-kit's English role descriptions ("sortable", "draggable") in Swedish too | ATS-41 | #107 ATS-57, AC1 |
| The Supabase CLI is not pinned for local use, so `npx supabase` resolves to 3.0.0 | ATS-42 | #107 ATS-57, AC2, with a note on what an upgrade to v3 needs |
| Nothing technical stops Claude Code from running remote Supabase commands | ATS-42 | #107 ATS-57, AC3 |

### Found while reviewing PRs

| Finding | Found in | Moved to |
|---|---|---|
| No warning when a new candidate looks like an existing one (same email or name) | PR #101, ATS-38 | #107 ATS-57, AC4 |
| A column name can match a default column's name in the other language | PR #104, ATS-40 | #107 ATS-57, AC5 |

### New tickets

- **#107 [ATS-57] Small hygiene fixes from epic 8** — `chore` and `security`, milestone Epic 9 — Teams. Translated drag role descriptions, the Supabase CLI pinned to 2.122.0 with a note for the v3 upgrade, deny rules for remote Supabase commands in `.claude/settings.json`, a warning for a likely duplicate candidate, column names checked against the defaults in both languages, honest comments on the candidate delete, and an end-to-end test of an admin managing a customer's columns.

## Notes for epic 9

- Teams replaces `customer_id = auth.uid()` in every policy. ATS-43 AC4 lists the places RLS doesn't cover: `reset_stages`'s own caller check and the trigger order `applications_set_customer` → `applications_start_stage`.
- Do ATS-57 AC2 and AC3 first: the epic will add migrations, and a pinned CLI plus deny rules make every `db push` predictable.
- Supabase CLI v3, when it comes: `migration list` and `db push` target the local stack by default and need `--linked`, and `[auth.email] enable_signup` in `supabase/config.toml` becomes `enabled`.
