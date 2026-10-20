---
name: ats-implement-ticket
description: "Implement a Mini-ATS ticket end-to-end: fetch the GitHub issue, branch, implement following CLAUDE.md, validate, commit in logical steps and report. Use when asked to implement a ticket, work on an issue or start a ticket (e.g. 'Implement ATS-9' or 'implement issue #7')."
argument-hint: "ATS-<N> or GitHub issue number, e.g. ATS-9 or #7"
---

# Implement Ticket — Mini-ATS

Implements one ticket end-to-end, following every rule in `CLAUDE.md`. Read `CLAUDE.md` first if it is not already in context.

The ticket is: `$ARGUMENTS`

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

---

## Step 1 — Fetch the ticket

Accept `ATS-9`, `#7` or `7`.

```bash
gh issue list --repo "$REPO" --state all --search "ATS-<N> in:title" --json number,title,body,labels,milestone,state --limit 10
# or, by issue number:
gh issue view <number> --repo "$REPO" --json number,title,body,labels,milestone,state
```

Use the issue whose title starts with exactly `[ATS-<N>]`. The search also matches `ATS-19` when you ask for `ATS-1`.

If there is no issue, fall back to the ticket's block in `TICKETS.md` and say so in the final summary.

From the ticket, extract:

1. **Type:** feat / fix / chore / docs / spike
2. **Acceptance Criteria:** every `- [ ]` item. Items already `- [x]` are done
3. **Layers:** Database / Edge Function / Data layer / UI
4. **Spec:** the relevant part of `docs/ui-spec.md`, and `docs/review-ats-1.md` for ATS-2

Then check the stop conditions. **Stop and ask the developer before writing any code** if the ticket needs any of these and the ticket text does not already decide it:

| Condition | Why |
|---|---|
| A change to the database schema or RLS that is not in the ticket | Security rests on the schema. See `CLAUDE.md` § Security rules |
| A new npm dependency that the ticket does not name | `CLAUDE.md` § Ask before |
| Deleting files | `CLAUDE.md` § Ask before |
| Using the service role key anywhere except the one action an Edge Function exists for | Security rules 1 and 2 |
| Reading the role from anything but `profiles.role` | Security rule 4 |

When running unattended (`CLAUDE.md` § Working on your own): choose the simplest option that matches the spec, note it in the summary and keep going. Stop only for schema changes and security rules.

---

## Step 2 — Create the branch

```bash
git switch main
git pull --ff-only origin main
git switch -c ats/ATS-<N>-short-kebab-description
```

The slug is 2–5 lowercase words describing what changes. If the branch already exists, ask whether to continue on it.

---

## Step 3 — Plan

Read the existing code in the area before changing anything. Where things live (how to split code into files is in `CLAUDE.md` § Code structure):

| What | Where |
|---|---|
| Types | `src/types/index.ts` (later also `src/integrations/supabase/types.ts`, generated) |
| Data functions, one file per table | `src/lib/api/<table>.ts` |
| Query keys and pure helpers | `src/lib/stages.ts` and other files in `src/lib/` |
| TanStack Query hooks | `src/hooks/use<Thing>.ts` |
| Auth | `src/contexts/AuthContext.tsx` (`useAuth()`) |
| Active customer | `src/contexts/ActiveCustomerContext.tsx`, `src/components/layout/CustomerGate.tsx` |
| Pages (file-based routes) | `src/routes/_authenticated.<page>.tsx`, `src/routes/login.tsx` |
| Dialogs and page parts | `src/components/<feature>/`, one component per file (`CLAUDE.md` § Code structure) |
| Layout | `src/components/layout/AppShell.tsx` and one file per shell part in the same folder |
| Shared states | `src/components/States.tsx` (`LoadingRows`, `EmptyState`, `ErrorState`, `PageHeader`) |
| shadcn/ui components | `src/components/ui/` |
| Theme tokens | `src/styles.css` |
| Translations | `src/locales/sv.json`, `src/locales/en.json` (from ATS-3) |
| Constants | `src/lib/constants.ts` (from ATS-4) |
| Migrations | `supabase/migrations/<timestamp>_<name>.sql` |
| RLS tests | `supabase/tests/rls_test.sql` |
| Edge Functions | `supabase/functions/<name>/index.ts` |
| Tests | `src/test/*.test.ts(x)` |

Only touch the layers the ticket needs. Write the plan as a short list before coding.

---

## Step 4 — Implement

Follow `CLAUDE.md` exactly. The rules that matter most:

### Data and security
- Supabase calls only in `src/lib/api/`. Components use hooks, never the client directly
- Every query key with customer data includes the customer id: `queryKeys.jobs(customerId)`
- Mutations invalidate the keys they affect. Card moves stay optimistic with rollback
- Never send `customer_id` from the client for `applications` or `cv_assessments`. Triggers set it
- Admin acting for a customer: create rows with the active customer's id from `useActiveCustomer()`
- Edge Functions: verify the caller first, read with the caller's JWT, use the service role only for the privileged write, handle CORS and `OPTIONS`, read secrets with `Deno.env.get`
- Every new table: RLS enabled, policies written, and a check added to `supabase/tests/rls_test.sql`

### TypeScript
- Strict mode. No `any`, no `as` casts to silence errors, no `@ts-ignore`
- Validate external input (search params, forms, Edge Function bodies) with zod

### No hardcoded values (`CLAUDE.md` § No hardcoded values)
- UI text through `t()` with a key in both `src/locales/sv.json` and `src/locales/en.json`, added in the same commit. Counts use i18next plurals
- Colours from theme tokens (`bg-card`, `text-muted-foreground`, `bg-stage-*`, `bg-column`, `bg-warning-muted`). Never hex, rgb or oklch in components
- Sizes and spacing from the Tailwind scale or named tokens in `src/styles.css`. No arbitrary values like `w-[230px]`
- Magic numbers become named constants in `src/lib/constants.ts`
- Errors from Edge Functions and the database are codes; the UI translates them
- `style={{}}` only for values computed at runtime, like a drag transform

### UI
- Code, comments and identifiers in English
- Reuse `src/components/ui/` and `States.tsx` before writing new components
- Every list and board: loading, empty and error states
- Works at 390 px wide
- Routes: create files in `src/routes/`. Never edit `src/routeTree.gen.ts` by hand (the dev server and build regenerate it)

### Tests
- Pure logic (date maths, validation, URL params, query keys) gets a Vitest test in `src/test/`

---

## Step 5 — Validation

Run all of them. Each must pass before every commit:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm run build` does not type-check on this stack, so `tsc` is required.

If the branch touches `supabase/`, also run the RLS tests against a local Postgres when one is available:

```bash
createdb ats_rls_test
psql -v ON_ERROR_STOP=1 -d ats_rls_test -f supabase/tests/local_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d ats_rls_test -f "$f"; done
psql -v ON_ERROR_STOP=1 -d ats_rls_test -f supabase/tests/rls_test.sql
dropdb ats_rls_test
```

Every check must print `OK`. If Postgres is not available locally, say so in the summary. CI runs the same job on the PR.

If the branch adds a migration, it must follow the migration rules in `CLAUDE.md` § Workflow. Run the dry run and show it to the developer:

```bash
npx supabase db push --dry-run
```

It must list only the migrations this branch adds. If it lists anything else, stop and tell the developer. Never run `db push` yourself without the developer's yes. When unattended, write in the summary that the migration still has to be applied before the merge.

Manual test, described in the summary: as admin acting for a customer, and as the customer. For data tickets, also as a second customer who must not see the first one's rows.

---

## Step 5b — Self-review

Before the last commit, read the whole branch as a strict reviewer:

```bash
git diff origin/main...HEAD
```

Check it against the quality bar in `CLAUDE.md`: correctness and edge cases, security, tests, accessibility, consistency, clean code and scope. Fix what you find and run the validation again. Note anything you chose not to fix, and why, in the summary.

---

## Step 6 — Commit in logical steps

Use `ats-git-commit`. Several small commits, ordered database → Edge Functions → data layer → UI → tests → docs. Stage files by name. Every commit builds and passes on its own.

```
(MODEL_NAME) <type> [ATS-<N>] imperative description
```

---

## Step 7 — Summary and issue update

Print this summary in the terminal:

```markdown
## [ATS-<N>] Implementation complete

### Summary
<One or two sentences: what was built and why.>

### What Was Done
1. **Database** — <item or "Not touched">
2. **Edge Functions** — <item or "Not touched">
3. **Data layer** — <item or "Not touched">
4. **UI** — <item or "Not touched">
5. **Tests** — <item or "Not touched">

### Acceptance Criteria
- [x] AC1: <text> — <how it was verified>
- [ ] AC2: <text> — <why not done>

### Manual Test Steps
1. <Step>

### Decisions and Tradeoffs
- <Choices made, things deferred, anything a reviewer should know>

### Validation
- lint ✅ / tsc ✅ / test ✅ / build ✅ / RLS ✅ or "not run locally — CI"
```

Then, **only if the developer is present and says yes**, post it to the issue and tick off the done ACs:

```bash
gh issue comment <number> --repo "$REPO" --body "<summary>"
gh issue edit <number> --repo "$REPO" --body "<issue body with completed - [ ] changed to - [x]>"
```

Never tick an AC that was not verified. Do not close the issue. The PR closes it with `Closes #<number>` when it merges.

When running unattended: print the summary and stop. Do not push, open a PR or post to GitHub.

---

## Completion checks

- [ ] Ticket fetched, every AC addressed or explained
- [ ] Branch `ats/ATS-<N>-...` created from an up-to-date `main`
- [ ] No Supabase calls outside `src/lib/api/`
- [ ] Query keys with customer data include the customer id
- [ ] No service role key in `src/`. Edge Functions read with the caller's JWT
- [ ] New tables have RLS and a check in `rls_test.sql`
- [ ] New migrations follow `CLAUDE.md` § Workflow, and the dry run lists only this branch's migrations
- [ ] No `any` or silencing casts
- [ ] No hardcoded values: text via `t()` in sv and en, theme tokens, no arbitrary sizes, named constants
- [ ] Loading, empty and error states, 390 px, accessible
- [ ] lint, tsc, test and build pass. RLS tests pass or are deferred to CI with a note
- [ ] Commits follow `(MODEL_NAME) <type> [ATS-<N>]` and are staged by file
- [ ] Self-review of the full diff done against the quality bar
- [ ] Summary printed. Issue updated only with the developer's yes
