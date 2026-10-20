---
name: ats-epic-review
description: "Senior close-out review of a Mini-ATS epic before moving on: ticket and PR completeness, security and RLS, data layer rules, code quality, validation, AC coverage and deployment health. Outputs a GO / NO-GO report. Use after the last ticket in an epic is merged, or at an epic checkpoint."
argument-hint: "Epic number, e.g. 2. Without it, the epic of the current branch is used"
allowed-tools: Bash(git log --oneline *), Bash(git branch -a), Bash(gh repo view *), Bash(gh issue list *), Bash(gh issue view *), Bash(gh pr list *), Bash(gh pr view *), Bash(gh run list *), Bash(gh api *), Bash(grep -rn *), Bash(npm ci), Bash(npm run lint), Bash(npx tsc --noEmit), Bash(npm test), Bash(npm run build), Glob, Grep, Read
---

# Epic Review — Mini-ATS

You are a **senior engineer** doing the close-out review before an epic is marked done. Find problems now, before they compound in the next epic. Be honest: a "GO" that hides real problems is worse than a "NO-GO" that costs an hour.

Input: `/ats-epic-review 2`. Without a number, use the epic of the current branch's ticket, or the most recent milestone with merged PRs.

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

---

## Step 1 — Scope

```bash
gh api "repos/$REPO/milestones?state=all" --jq '.[] | "\(.number) \(.title) open=\(.open_issues) closed=\(.closed_issues)"'
gh issue list --repo "$REPO" --milestone "<Epic N — Name>" --state all --json number,title,state,body --limit 50
```

Identify every `[ATS-<N>]` ticket in the epic, which are closed, and their acceptance criteria. Also read the epic's **Checkpoint** line in `TICKETS.md`; it is the epic's own definition of done. Any open ticket is a blocker.

---

## Step 2 — PR audit

```bash
gh pr list --repo "$REPO" --state merged --json number,title,headRefName,mergedAt,body --limit 50
```

For each ticket check:
- There is a merged PR from an `ats/ATS-<N>-...` branch
- The PR body has What Changed, Acceptance Criteria, Manual Test Steps and `Closes #<n>`
- No ticket was closed without a merged PR (a closed issue without a PR is fine only if the work happened outside the code, like ATS-1 in Lovable, and the issue says so)

---

## Step 3 — Security and RLS (any finding is a blocker)

```bash
# Service role key in the frontend
grep -rn "service_role\|SERVICE_ROLE" src/

# Role read from user_metadata
grep -rn "user_metadata" src/ supabase/functions/ 2>/dev/null

# Supabase client used outside the data layer and auth
grep -rln "supabase\." src/ | grep -v "src/lib/api/\|src/integrations/supabase/\|src/contexts/AuthContext"

# Every table in the migrations has RLS
grep -hn "create table" supabase/migrations/*.sql
grep -hn "enable row level security" supabase/migrations/*.sql

# Secrets or env files committed
git ls-files | grep -E "\.env($|\.)" | grep -v ".env.example"
```

Also check:
- Every Edge Function checks the caller first and handles `OPTIONS`
- No client code sends `customer_id` for `applications` or `cv_assessments`
- After epic 1: `DemoLogin` is gone, public sign-up is off, and `src/lib/api/mockStore.ts` is not imported by any file that has been switched to Supabase

---

## Step 4 — Code quality

```bash
# TODO / FIXME
grep -rn "TODO\|FIXME" src/ supabase/ --include="*.ts" --include="*.tsx" --include="*.sql"

# Leftover debug logging
grep -rn "console\.log" src/ supabase/functions/ 2>/dev/null

# any and silencing casts
grep -rn ": any\b\|as any\|@ts-ignore\|@ts-expect-error" src/ supabase/functions/ 2>/dev/null

# Raw colours outside the theme
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(" src/ --include="*.tsx" --include="*.ts" | grep -v "src/styles.css\|src/components/ui/"

# Arbitrary Tailwind values outside vendored shadcn/ui (variant selectors like data-[state=open] are fine)
grep -rnoE "\b[a-z:-]+-\[[0-9.]+(px|rem|vh|vw|%)\]" src/ --include="*.tsx" | grep -v "src/components/ui/"

# Hardcoded UI text: Swedish characters or JSX text outside the locale files
grep -rnE "[åäöÅÄÖ]" src/ --include="*.tsx" --include="*.ts" | grep -v "src/locales/\|mockStore\|src/test/"
# (^|[^=]) skips "=>" in TypeScript types such as "=> Promise<Profile>"
grep -rnE "(^|[^=])>[[:space:]]*[A-Za-zÅÄÖåäö][^<>{}]{2,}<" src/ --include="*.tsx" | grep -v "src/components/ui/"

# Locale files have the same keys (the Vitest parity test must pass)
npx vitest run --reporter=dot 2>&1 | tail -3

# Query keys without a customer id
grep -rn "queryKey:" src/ --include="*.ts" --include="*.tsx"
```

Classify each TODO as a known deferral (warning) or a missing implementation (blocker). Check that every customer-data query key goes through `queryKeys.*(customerId)`.

---

## Step 5 — Validation

On an up-to-date `main`:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Then check CI and the RLS tests:
```bash
gh run list --repo "$REPO" --branch main --limit 5
```

The last run on `main` must be green, including the RLS job. Any failure is a blocker.

---

## Step 6 — Acceptance criteria

For every ticket, read the code that implements each AC. Do not trust that a closed issue means the AC is met. Mark each AC as implemented (with file:line), partial, or missing.

---

## Step 7 — Integration and deployment health

- `src/routeTree.gen.ts` matches the files in `src/routes/` (the build regenerates it; a diff after `npm run build` means it was not committed)
- `.env.example` lists every `VITE_*` variable the code reads: `grep -rn "import.meta.env.VITE_" src/`
- After a schema change: `src/integrations/supabase/types.ts` matches the project (regenerate and compare as in `CLAUDE.md` § Workflow)
- `npx supabase migration list` shows no local migration missing on Remote (needs the linked CLI; otherwise "Could not verify")
- Edge Functions in `supabase/functions/` are deployed (ask the developer to confirm, or check `npx supabase functions list` if the CLI is linked)
- The production deployment on Vercel is green and the checkpoint's manual test was run there

Anything you cannot check, say "Could not verify — <reason>". Never guess.

---

## Step 8 — Report

```
# Epic N Review — <Epic name>
Date: <today>
Tickets reviewed: ATS-X, ATS-Y
Generated by: /ats-epic-review

---

## VERDICT: ✅ GO / ❌ NO-GO

<One sentence. GO means every check passes, ACs are covered, CI is green and security is sound. NO-GO lists the blockers.>

---

## 1. Tickets and PRs — PASS / FAIL
- ATS-X: <title> — closed ✅ / open ❌ — PR #<n> ✅ / missing ❌ — template ✅ / incomplete ❌

## 2. Security and RLS — PASS / FAIL
| Check | Result |
|---|---|
| No service role key in src/ | ✅ / ❌ |
| Role never read from user_metadata | ✅ / ❌ |
| Supabase calls only in the data layer and auth | ✅ / ❌ |
| Every table has RLS and a test | ✅ / ❌ |
| Edge Functions check the caller | ✅ / ❌ / n/a |
| No secrets committed | ✅ / ❌ |

## 3. Code Quality — PASS / FAIL
| Check | Result |
|---|---|
| No blocker TODOs | ✅ / ❌ |
| No console.log | ✅ / ❌ |
| No any or silencing casts | ✅ / ❌ |
| No raw colours | ✅ / ❌ |
| No arbitrary sizes | ✅ / ❌ |
| No hardcoded UI text, sv and en in sync | ✅ / ❌ |
| Query keys include customer id | ✅ / ❌ |

## 4. Validation — PASS / FAIL
| Command | Result |
|---|---|
| npm ci | ✅ / ❌ |
| npm run lint | ✅ / ❌ |
| npx tsc --noEmit | ✅ / ❌ |
| npm test | ✅ / ❌ |
| npm run build | ✅ / ❌ |
| CI on main (app + RLS) | ✅ / ❌ |

## 5. Acceptance Criteria — PASS / FAIL
**ATS-X — <title>**
- AC1: <text> — ✅ <file:line> / ⚠️ partial / ❌ missing
<N of M fully covered>

## 6. Integration and Deployment — PASS / FAIL
<Route tree, env vars, generated types, Edge Functions, Vercel, checkpoint test>

## Blockers (fix before Epic N+1)
1. <file:line — what is wrong — what to do>  (or "No blockers — safe to proceed.")

## Warnings
1. <description>  (or "No warnings.")

## Senior Notes
<2–4 honest sentences: overall quality, habits that should change, what will hurt in the next epic.>
```

## Output rules

- Never mark a section PASS if you found a violation, even a small one
- Any ❌ in Security or Validation makes the verdict NO-GO
- A blocker TODO makes the verdict NO-GO
- Name files, lines and exact issues
- Do not skip sections

## Next step

Fix the blockers first: `/ats-audit-to-issues blockers` creates a ticket for each. When the verdict is GO, run `/ats-epic-close <N>` to triage the warnings and the `TICKETS.md` findings and write `docs/review-epic-<N>.md`.
