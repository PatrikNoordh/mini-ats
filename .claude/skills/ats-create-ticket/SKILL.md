---
name: ats-create-ticket
description: "Create a GitHub issue for Mini-ATS from a short description, or import every ticket in TICKETS.md as issues. Use when asked to create, open or add a ticket/issue (e.g. 'Create a ticket for …'), or to import the ticket plan ('/ats-create-ticket import')."
argument-hint: "Short description of the ticket, or 'import' to create issues from TICKETS.md"
---

# Create GitHub Issue — Mini-ATS

Creates well-structured GitHub issues following Mini-ATS conventions. GitHub Issues are the live source of truth for tickets and their status. `TICKETS.md` is the original plan.

The request is: `$ARGUMENTS`

Always work against the current repository. Never hardcode the repo name:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

If `$ARGUMENTS` is `import`, go to **Import mode** at the bottom. Otherwise follow the steps below.

---

## Step 1 — Classify the ticket

| Type | When | Example title |
|------|------|---------------|
| `feat` | New user-facing behaviour, page, Edge Function or table | `Add CV upload to the candidate panel` |
| `fix` | Something broken or incorrect | `Fix job filter kept after customer switch` |
| `chore` | Tooling, CI, config, no user-visible change | `Add RLS tests to CI` |
| `refactor` | Restructure without behaviour change | `Move magic numbers into constants` |
| `docs` | Documentation only | `Write README security section` |
| `spike` | Time-boxed investigation | `Spike: pdf text extraction in Edge Functions` |

---

## Step 2 — Check that the work does not already exist

1. Pick the key identifiers from `$ARGUMENTS`: component, hook, route, table, function or file names.
2. Search the code for each one:

   ```bash
   grep -rn "<Symbol>" src/ supabase/ --include="*.ts" --include="*.tsx" --include="*.sql" | head -10
   ```

3. Search open and closed issues for overlap:

   ```bash
   gh issue list --repo "$REPO" --state all --search "<key words>" --json number,title,state --limit 20
   ```

If anything matches, show the file:line or issue and stop with these options:

```
⚠️  DUPLICATE RISK
"<Symbol>" already exists in <file:line> / issue #<n> [ATS-<N>] <title>

Options:
  A) Stop — already implemented or already ticketed.
  B) Proceed — this ticket extends the existing work (state what is new).
  C) Link — reference the existing file or issue in the new ticket.
```

Do not continue until the developer chooses.

---

## Step 3 — Next ATS number

```bash
gh issue list --repo "$REPO" --state all --json title --limit 300 | \
  python3 -c "
import sys, json, re
nums = [int(m.group(1)) for i in json.load(sys.stdin) for m in [re.search(r'ATS-(\d+)', i['title'])] if m]
print(max(nums) + 1 if nums else 1)
"
```

Also check the highest `ATS-<N>` in `TICKETS.md` and use whichever is higher. Call it `NEXT`.

---

## Step 4 — Milestone and labels

**Milestone:** the epic the work belongs to, using the exact `## Epic N — Name` heading from `TICKETS.md` (for example `Epic 3 — Kanban`). Work that fits no epic goes in the latest open epic. Ask if unsure.

**Labels:**
- The type from Step 1: `feat` / `fix` / `chore` / `refactor` / `docs` / `spike`
- `security` if the ticket touches RLS, auth, roles, Edge Functions or the service role key
- `database` if it changes `supabase/migrations/`
- Any label or milestone the request names explicitly, for example `priority:high` from `ats-audit-to-issues`

Create a label only if `gh label list` does not have it, and never with `--force`: on a label that exists, `--force` resets its colour and description (it reset `feat`, `security` and `database` while #109–#112 were created). Safe to re-run:

```bash
gh label list --repo "$REPO" --limit 200 --json name --jq '.[].name' | grep -qxF "<label>" \
  || gh label create "<label>" --repo "$REPO"
```

---

## Step 5 — Draft the issue body

### feat / fix / chore template

```markdown
## Context
<Why this ticket exists. What problem it solves for the customer or the admin.>

## Acceptance Criteria
- [ ] AC1: <Specific, testable outcome>
- [ ] AC2: <Specific, testable outcome>

## Scope Boundary
**In scope:** <what is included>
**Out of scope:** <what is explicitly not included>

## Technical Notes
- Layers touched: <Database / Edge Function / Data layer (src/lib/api, src/hooks) / UI (src/routes, src/components)>
- Database change: <No / Yes — new migration in supabase/migrations/ + matching check in supabase/tests/rls_test.sql>
- Security impact: <None / RLS / auth / roles / service role in an Edge Function>
- New npm dependency: <No / Yes — name and reason, needs approval>
- Spec reference: <docs/ui-spec.md section, or "none">
- Depends on: <ATS-<N> or "none">

## Edge Cases
- [ ] Loading, empty and error states
- [ ] Works at 390 px wide
- [ ] Admin acting for a customer: data is created for the selected customer
- [ ] Customer B cannot see or change customer A's rows
- [ ] New UI text in both sv and en, no hardcoded values

## Definition of Done
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` pass
- [ ] RLS tests pass if the schema changed
- [ ] Tested manually as admin and as customer
```

### bug variant

Replace Context with:

```markdown
## What Happens
<Actual behaviour>

## What Should Happen
<Expected behaviour>

## Steps to Reproduce
1. <Step>
2. <Step>

## Where
- Page: <e.g. /pipeline>
- Role: <admin acting for X / customer>
- Environment: <local / Vercel preview / production>
```

Keep Acceptance Criteria and Definition of Done, and add `- [ ] Regression test added` when the bug is in testable logic.

### spike template

```markdown
## Question to Answer
<The specific question>

## Time Box
<Maximum time, e.g. 1 hour>

## Output
- [ ] Findings posted as a comment on this issue
- [ ] Recommendation with pros and cons
- [ ] Follow-up tickets created if needed
```

---

## Step 6 — Create the issue

```bash
gh issue create --repo "$REPO" \
  --title "[ATS-<NEXT>] <Imperative title>" \
  --body "<body from Step 5>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

Then append a short entry to the matching epic in `TICKETS.md` so the plan stays complete:

```markdown
### ATS-<NEXT> · <type> · <Title>

Tracked in #<issue number>.
```

Do not commit. Leave the `TICKETS.md` change for the developer or the next ticket branch.

---

## Step 7 — Report back

```
✅ Issue created: [ATS-<NEXT>] <Title>
🔗 <issue URL>

Type:      <type>
Milestone: <Epic N — Name>
Labels:    <labels>

Suggested branch: ats/ATS-<NEXT>-short-description
```

---

## Import mode (`/ats-create-ticket import`)

Creates one issue per ticket in `TICKETS.md`. Run it once, before the first pull request, so that issue numbers line up with ticket numbers (issues and PRs share GitHub's counter).

1. **Read `TICKETS.md`.** Each `## Epic N — Name` heading is a milestone. Each `### ATS-<N> · <type> · <Title>` block is a ticket. Everything until the next `###` or `##` is its body: Context, Acceptance Criteria, Scope Boundary and any Checkpoint line.

2. **Skip tickets that already exist:**
   ```bash
   gh issue list --repo "$REPO" --state all --json number,title --limit 300
   ```
   A ticket exists if an issue title starts with `[ATS-<N>]`.

3. **Create missing milestones** (gh has no milestone command, so use the API):
   ```bash
   gh api "repos/$REPO/milestones" --jq '.[].title'
   gh api "repos/$REPO/milestones" -f title="Epic 0 — Foundation" -f description="<first paragraph under the heading, if any>"
   ```

4. **Create the missing type labels** as in Step 4: only the ones `gh label list` does not have, never with `--force`. Add `security` for ATS-5, ATS-6, ATS-7, ATS-17 and ATS-18, and `database` for ATS-5.

5. **Create the issues in ATS order**, one at a time:
   - Title: `[ATS-<N>] <Title>`
   - Body: the ticket's block from `TICKETS.md` as it is, including `- [x]` items, plus a final line `Source: TICKETS.md`
   - The epic's `**Checkpoint:**` line goes in the body of the last ticket in that epic

6. **Close tickets that are already done.** A ticket is done only if every AC is `- [x]`. Close it with a comment that says so. Leave everything else open.

7. **Report** a table of ATS id, issue number, milestone and state. Flag any ticket where the issue number does not match the ATS number.

Before step 5, show the plan (number of milestones, labels and issues to create) and wait for the developer to say go.

---

## Rules

- Issues only. Never create branches, commit, push or edit code
- Titles: `[ATS-<N>] Short imperative description`
- Label and milestone commands must be safe to re-run
- Database and security changes are always flagged in Technical Notes
- New npm dependencies are flagged and need developer approval
