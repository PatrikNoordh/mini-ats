---
name: ats-review-pr
description: "Review a Mini-ATS pull request or branch before it merges into main: security and RLS, data layer rules, TypeScript, UI rules, tests and PR hygiene. Use when asked to review a PR, review this branch, or check a PR before merge."
argument-hint: "Optional: PR number, e.g. 12. Without it, the current branch is reviewed against main"
allowed-tools: Bash(gh repo view *), Bash(gh pr view *), Bash(gh pr diff *), Bash(gh pr checks *), Bash(gh issue view *), Bash(git diff *), Bash(git log --oneline *), Bash(git rev-parse --abbrev-ref HEAD), Bash(grep -rn *), Read, Glob, Grep
---

# PR Review — Mini-ATS

Reviews code before it merges into `main`. The flow is `ats/ATS-<N>-... → PR → main`, and `main` deploys to production on Vercel, so this is the last stop.

The argument is: `$ARGUMENTS`

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

---

## Step 1 — What to review

With a PR number:
```bash
gh pr view <number> --repo "$REPO" --json number,title,body,files,commits,baseRefName,headRefName
gh pr diff <number> --repo "$REPO"
gh pr checks <number> --repo "$REPO"
```

Without one, review the current branch:
```bash
git diff origin/main...HEAD --name-only
git diff origin/main...HEAD
git log --oneline origin/main..HEAD
```

Confirm the PR targets `main`. Find the linked issue (`Closes #<n>`) and read its acceptance criteria.

---

## Step 2 — Read every changed file in full

Read each file completely before forming an opinion. Do not review code you have not read. For changed functions, also read their callers.

---

## Step 3 — Checks

### Security (any failure is a 🔴 blocker)
- No service role key in `src/`: `grep -rn "service_role\|SERVICE_ROLE" src/`
- No secrets in the diff, and no `.env*.local` files
- Edge Functions verify the caller before doing anything, read with the caller's JWT, and use the service role only for the one privileged write
- The role is read from `profiles.role`, never from `user_metadata`
- New tables: RLS enabled, policies written, and a matching check added to `supabase/tests/rls_test.sql`
- Existing RLS policies changed: flag it and explain the effect
- A new migration follows the migration rules in `CLAUDE.md` § Workflow, and the PR says it was applied or will be before the merge. A migration left to "apply later" is a blocker
- No client code sends `customer_id` for `applications` or `cv_assessments`
- No path that allows public sign-up
- AI output is labelled as a suggestion and is never written from the client

### Data layer
- Supabase calls only in `src/lib/api/`. Components use hooks from `src/hooks/`
- Query keys with customer data include the customer id
- Mutations invalidate the right keys. Errors reach the UI as an error state or a toast, never silently
- Supabase results check `error` before using `data`
- Admin acting for a customer: writes use the active customer's id

### TypeScript
- No `any`, no `as` casts that silence errors, no `@ts-ignore`
- External input (search params, forms, Edge Function bodies) validated with zod
- `src/routeTree.gen.ts` not edited by hand

### UI
- Code, comments and identifiers in English
- Files follow `CLAUDE.md` § Code structure. A dialog or page part in a route file, or several components in one file outside that section's exception, is a 🟡 warning

### No hardcoded values
- Every user-facing string goes through `t()` and exists in both `src/locales/sv.json` and `src/locales/en.json`. A string in only one language is a 🟡 warning; hardcoded text in a component is a 🟡 warning
- No hex, rgb or oklch outside `src/styles.css`. No arbitrary Tailwind values like `w-[230px]` outside `src/components/ui/`
- No magic numbers: limits, delays and thresholds are named constants in `src/lib/constants.ts`
- Edge Functions and database errors return codes, not user-facing text
- Loading, empty and error states on every list and board
- Works at 390 px wide
- Accessible: every input has a label, controls are reachable by keyboard, focus is visible
- Reuses `src/components/ui/` and `States.tsx` instead of new one-off components

### Tests and CI
- New pure logic has a Vitest test
- `gh pr checks` shows both CI jobs (app and RLS) green. If not, it is a blocker
- A Vercel preview exists and the manual test steps in the PR were run there or locally

### Quality bar
- The change meets the quality bar in `CLAUDE.md`: edge cases handled, no dead code or stray `console.log`, no `TODO` without an issue, and nothing outside the ticket's scope

### PR hygiene
- Branch: `ats/ATS-<N>-short-description`
- Commits: `(MODEL_NAME) <type> [ATS-<N>] description`, small and in a sensible order
- PR title: `<type> [ATS-<N>] Title Case Summary`
- PR body: Summary, What Changed, Acceptance Criteria, Manual Test Steps, Tradeoffs, and `Closes #<n>`
- Every acceptance criterion in the issue is either covered or explained

---

## Step 4 — Output

```
## Code Review — [ATS-<N>] <PR title>

**Status:** ✅ Approved | ⚠️ Needs changes | ❌ Blocked

### Summary
<2–3 sentences: what the PR does and the overall assessment>

### Issues
| Severity | File:line | Issue |
|----------|-----------|-------|
| 🔴 Blocker | path/to/file.ts:12 | <description> |
| 🟡 Warning | path/to/file.tsx:40 | <description> |
| 🟢 Suggestion | path/to/file.tsx:7 | <description> |

### Acceptance Criteria
- AC1: <text> — ✅ <file:line> / ⚠️ partial / ❌ missing

### Checks That Failed
<Only the failed items from Step 3>

### What Was Done Well
<Specific, concrete good patterns>

### Verdict
<Clear recommendation and why>
```

If reviewing a real PR, ask the developer before posting the review as a comment:
```bash
gh pr comment <number> --repo "$REPO" --body "<review>"
```

## Severity

- 🔴 **Blocker:** security rule broken, missing RLS, failing CI, type error, AC claimed but not implemented. Do not merge
- 🟡 **Warning:** missing state, missing test, hardcoded value, hygiene issue. Fix before merge if it is quick
- 🟢 **Suggestion:** optional improvement. Can merge as is

## Rules

- Do not invent issues that are not in the diff
- Do not suggest refactors outside the PR's scope
- Never approve a PR with a 🔴 blocker
- Never approve or merge on the developer's behalf. The review is advice
- Fix 🔴 blockers and real bugs on the branch before the merge. Log 🟢 suggestions, and 🟡 warnings that are not quick to fix, as one line each in `TICKETS.md` § Found while reviewing PRs, with the PR number
