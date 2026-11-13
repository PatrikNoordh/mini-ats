---
name: ats-git-ship
description: "Ship a finished Mini-ATS ticket branch: validate, sync with main, commit what is left, push and open a PR that closes the issue. Use when: shipping a finished ticket, sending code for review, pushing a completed change, opening a PR."
argument-hint: "Optional: ATS-<N> or extra notes for the PR description"
allowed-tools: Bash(git status), Bash(git diff --stat), Bash(git diff *), Bash(git log --oneline *), Bash(git add *), Bash(git commit -m *), Bash(git rev-parse --abbrev-ref HEAD), Bash(git rev-parse --abbrev-ref --symbolic-full-name @{u}), Bash(git fetch origin), Bash(git rebase origin/main), Bash(npm run lint), Bash(npx tsc --noEmit), Bash(npm test), Bash(npm run build), Bash(gh repo view *), Bash(gh issue list *), Bash(gh issue view *), Bash(gh pr view *)
---

# Git Ship — Mini-ATS

Ships the current `ats/ATS-<N>-...` branch and opens a PR to `main`. Run every step in order.

`git push` and `gh pr create` are deliberately **not** in `allowed-tools`: Claude Code asks before each, as `CLAUDE.md` requires. Running this skill is the developer's request to ship, so say yes to those prompts.

Never run this skill unattended (`CLAUDE.md` § Working on your own).

The optional argument is: `$ARGUMENTS`

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

---

## Step 1 — Verify the branch

```bash
git rev-parse --abbrev-ref HEAD
```

- On `main`: **stop**. Direct pushes to `main` are not allowed. Use `ats-git-branch-and-ship`
- The branch must follow `ats/ATS-<N>-...`. Extract `ATS-<N>`
- Exception: an epic close-out branch `ats/epic-<N>-review` from `ats-epic-close`. Use `[Epic <N>]` wherever this skill says `[ATS-<N>]`, skip the issue lookup, and leave out `Closes`. In the PR body, link the issues the close-out changed instead
- Find the issue:
  ```bash
  gh issue list --repo "$REPO" --state all --search "ATS-<N> in:title" --json number,title,url,body --limit 10
  ```
  Use the one whose title starts with exactly `[ATS-<N>]`. Note its number and URL. If none exists, warn and continue without `Closes`

---

## Step 2 — Validation

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

All four must pass. Then the same extra checks as `ats-implement-ticket` § Validation:

- If the branch touches `supabase/`, the RLS tests against a local Postgres.
- If the branch touches `supabase/functions/`, the Deno checks the way the CI `functions` job runs them (`DENO_NO_PACKAGE_JSON=1`):
  ```bash
  deno check supabase/functions/*/index.ts
  deno test --allow-env supabase/functions
  ```
- The end-to-end tests when Docker is available. `start`, `stop` and `status` are the only `npx supabase` commands for the local stack, and never anything with `--linked`:
  ```bash
  npx supabase start
  npm run test:e2e
  npx supabase stop
  ```

A check that cannot run here (no Postgres, Deno or Docker) is noted for CI in the PR's Validation section, never left out silently.

**If anything fails, stop and fix it before continuing.**

---

## Step 3 — Sync with main

```bash
git fetch origin
git rebase origin/main
```

On conflicts, **stop and report**. Never resolve conflicts automatically. After a rebase, run Step 2 again.

---

## Step 4 — Commit what is left

1. `git status` and `git diff --stat`
2. Clean working tree: go to Step 5
3. Otherwise commit with `ats-git-commit`: logical groups, files staged by name, never `git add .`
4. **If a commit fails, stop**

---

## Step 5 — Push

1. Show the branch's commits: `git log --oneline origin/main..HEAD`
2. Check every subject follows `(MODEL_NAME) <type> [ATS-<N>] ...` and list any that do not
3. Push:
   - No upstream: `git push -u origin <branch>`
   - Upstream set: `git push`
4. Never force-push. `.claude/settings.json` blocks it. If a rebase means an already-pushed branch needs `git push --force-with-lease`, stop and ask the developer to run it themselves

**If the push fails, stop.**

---

## Step 6 — Open the PR

Use `.github/pull_request_template.md` if it exists, filled in. Otherwise use this body:

```markdown
## [ATS-<N>] <Title>

Closes #<issue number>

### Summary
<One or two sentences: what was built and why.>

### What Changed
1. **Database** — <migrations, RLS, or "Not touched">
2. **Edge Functions** — <or "Not touched">
3. **Data layer** — <src/lib/api, src/hooks, or "Not touched">
4. **UI** — <routes, components, or "Not touched">
5. **Tests** — <or "Not touched">

### Acceptance Criteria
- [x] AC1: <text>
- [ ] AC2: <text> — <why not done>

### Manual Test Steps
1. <Step, including which role: admin acting for a customer, customer A, customer B>

### Tradeoffs
- <Decisions, deferrals, new dependencies, schema changes>

### Validation
- lint / tsc / test / build ✅
- RLS tests: ✅ locally / CI
```

```bash
gh pr create --repo "$REPO" --base main --title "<type> [ATS-<N>] <Title Case Summary>" --body "<body>"
```

- Title: `<type> [ATS-<N>] Title Case Summary`, where type is the main commit type
- `Closes #<number>` must be in the body so the issue closes when the PR merges
- Show the PR URL to the developer

---

## Step 7 — After the PR is open

- If the PR adds a migration, it reaches the project before the merge as described in `CLAUDE.md` § Workflow. Claude never runs a command against the linked project, not even a read-only one: it prints each command for the developer to run in their own terminal and paste back.
  1. The developer runs `npx supabase db push --remote --dry-run`. It must list only this branch's migrations; anything else, stop. Without `--remote`, CLI v3 targets the local stack (ATS-59)
  2. With the developer's yes, the developer runs `npx supabase db push --remote` and answers yes at its prompt (v3 defaults to No)
  3. The developer regenerates the types, and Claude compares them and commits and pushes a diff to the branch:
     ```bash
     # the developer runs:
     npx supabase gen types typescript --remote > src/integrations/supabase/types.ts && npx prettier --write src/integrations/supabase/types.ts
     # Claude runs:
     git diff src/integrations/supabase/types.ts
     ```
  4. If the migration changes tables, policies or functions, ask the developer to run `supabase/tests/rls_test.sql` in the SQL Editor against the project, and add the result to the PR's Validation section
- If the PR adds or changes an Edge Function, the developer deploys it (`npx supabase functions deploy <name>`) before the merge when the code on `main` will call it, and after the merge otherwise
- Tell the developer to wait for both CI jobs (app and RLS) and the Vercel preview before merging
- Suggest running `ats-review-pr <number>` before merging
- Always ask: "Tick AC1–AC<n> on #<number> now that the PR covers them?" Tick them only after a yes, and only the ACs the PR marks `- [x]`:
  ```bash
  gh issue view <number> --repo "$REPO" --json body -q .body > "$SCRATCH/body<number>.md"
  # change the verified items to - [x] in "$SCRATCH/new<number>.md", then:
  gh issue edit <number> --repo "$REPO" --body-file "$SCRATCH/new<number>.md"
  ```
  If the answer is no, say that `ats-review-pr` ticks them when it approves.

---

## Completion checks

- [ ] Branch is not `main` and follows `ats/ATS-<N>-...` (or `ats/epic-<N>-review`)
- [ ] lint, tsc, test and build pass. RLS tests passed or noted for CI
- [ ] A new migration is applied with the developer's yes, the types are compared, and the SQL Editor RLS run is in the PR when needed
- [ ] Rebased on `origin/main` without conflicts
- [ ] Files staged by name, commits follow the format, no `--no-verify`
- [ ] Push succeeded, no force-push
- [ ] PR to `main` with the template filled in and `Closes #<number>` (not for `ats/epic-<N>-review`)
- [ ] PR URL shown
- [ ] Asked whether to tick the issue's ACs (not for `ats/epic-<N>-review`)
