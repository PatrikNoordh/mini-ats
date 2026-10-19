---
name: ats-epic-close
description: "Close a Mini-ATS epic after /ats-epic-review: triage every open finding in TICKETS.md and every review warning into an extra AC on an open ticket, one hygiene ticket, or a drop; empty the findings lists; and write docs/review-epic-<N>.md so readers can see what happened between epics. Use after the epic review, or when asked to 'close the epic', 'triage the findings', 'clean the backlog' or 'write up the epic review'."
argument-hint: "Epic number, e.g. 1. Without it, the epic of the latest /ats-epic-review in this conversation"
---

# Epic Close-out — Mini-ATS

Runs after `/ats-epic-review`. It turns the review and the `TICKETS.md` findings into decisions, puts each decision where the work will happen, and writes the record down.

The rule it applies, from `TICKETS.md` § Found while building: at each epic checkpoint the findings lists are triaged and emptied. Small findings ride along on tickets that touch the same code instead of becoming tickets of their own.

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

---

## Step 1 — Preconditions

- An `/ats-epic-review` report for this epic must be in the conversation. If there is none, stop and ask the developer to run `/ats-epic-review <N>` first.
- **Blockers are not triaged here.** They are fixed before the epic closes: on their own ticket via `/ats-audit-to-issues blockers`, or on a branch the developer names. If the verdict is NO-GO because of a real problem, stop and say so. A NO-GO that only waited on something outside the code (a queued CI run) can continue once that has turned green; note it in the report.

---

## Step 2 — Collect

1. Every line under `TICKETS.md` § Found while building and § Found while reviewing PRs, including lines already ticked `- [x]`.
2. Every item under **Warnings** in the review report. A warning that only says "the findings lists are not ticketed" is covered by item 1 and is not a separate finding.
3. Open issues that could take a finding:

   ```bash
   gh issue list --repo "$REPO" --state open --json number,title,milestone,body --limit 100
   ```

Check each finding against the current code (`grep -rn`). Files move between tickets, so fix stale paths now.

---

## Step 3 — Triage

Give every finding exactly one outcome:

| Outcome | When | What happens |
|---|---|---|
| **Extra AC** | An open ticket already rewrites the file or feature | A new AC at the end of that issue's Acceptance Criteria |
| **Hygiene ticket** | Small, belongs to no feature ticket | One AC in this epic's hygiene ticket (one ticket per epic, never one per finding) |
| **Own ticket** | A real bug or security problem that cannot wait for a feature ticket | `/ats-create-ticket` with `fix`, and `security` if relevant |
| **Already covered** | An open ticket's AC already says it | Link that issue and AC |
| **Already fixed** | The line is `- [x]`, or the code shows it is done | Note where it was fixed |
| **Dropped** | The code it is about is going away, or it is not worth doing | One-line reason |
| **Done now** | A one-minute action outside the code, such as ticking boxes on a closed issue | Do it in Step 5 |
| **No action** | It is about history that cannot change, such as a merged PR without a review comment | Record it in the report only |

Prefer **Extra AC** over a new ticket whenever a ticket touches the same code. Never put a finding on a closed ticket.

Show the triage as a table (finding, source, outcome, target) and **wait for the developer to confirm** before writing anything to GitHub.

---

## Step 4 — Source notes

Every AC added from a finding ends with where it came from, so the ticket explains itself:

- From § Found while building: `(found while building ATS-<N>)`
- From § Found while reviewing PRs: `(found in the PR review of ATS-<N>, PR #<n>)`
- From an epic review warning: `(found in the epic <N> review)`

A file path, when useful, goes in the same parentheses first: `` (`src/components/accounts/AccountDialog.tsx:77`, found while building ATS-3) ``.

---

## Step 5 — Apply

Work in the scratchpad, never in the repo, for issue bodies.

1. **Extra ACs.** For each target issue, read the body, insert the new ACs after the last `- [ ] ACn` / `- [x] ACn` line with the next numbers, show the diff, then write it back:

   ```bash
   gh issue view <n> --repo "$REPO" --json body -q .body > "$SCRATCH/body<n>.md"
   # edit into "$SCRATCH/new<n>.md", then:
   gh issue edit <n> --repo "$REPO" --body-file "$SCRATCH/new<n>.md"
   ```

2. **Hygiene ticket.** Run `ats-create-ticket` once with all hygiene findings as its ACs. Title: `Small hygiene fixes from epic <N>`, type `chore`. Milestone: the epic where the work fits best. When none fits, Epic 5 — Ready to deliver, the polish epic. If a hygiene ticket from an earlier epic is still open, add the ACs to it instead.
3. **Own tickets.** Run `ats-create-ticket` once per finding.
4. **Done now.** Do the action, for example tick the boxes on a closed issue whose PR shows the work was done.

---

## Step 6 — Clean `TICKETS.md`

- Remove every finding line from both Found while... sections, whatever its outcome. Keep the headings, the intro and the `Format:` lines.
- If `ats-create-ticket` added an entry for a new ticket, keep it.
- Nothing else in the file changes.

---

## Step 7 — Write the report

Create `docs/review-epic-<N>.md`, following `docs/review-epic-0.md`:

```markdown
# Review of Epic <N> — <Name>

Reviewed on <date> with `/ats-epic-review`, on `main` at `<sha>` (after PR #<n>). This file records the result, what was decided afterwards, and where every open finding went.

## Verdict: GO / NO-GO
<What the verdict was, and if it changed, why.>

## What was checked
| Area | Result |
<Tickets and PRs, Security and RLS, Code quality, Validation, Acceptance criteria, Deployment. Then one line on what was not verified.>

## Warnings and what was done
| Warning | Decision |

## How the findings were triaged
<One short paragraph on the rule.>

### Found while building
| Finding | Found in | Moved to |

### Found while reviewing PRs
| Finding | Found in | Moved to |

### New tickets
- **#<n> [ATS-<N>] <Title>** — <type>, milestone <Epic>. <What it holds.>

## Notes for epic <N+1>
<2–3 bullets: what to watch in the next epic.>
```

Facts only, from the review and from what was actually done in this run. "Moved to" is always `#<issue> ATS-<N>, AC<n>`, or "Already fixed in ATS-<N>" / "Already in #<n>" / "Dropped: <reason>".

---

## Step 8 — Commit

1. Branch from an up-to-date `main`: `ats/epic-<N>-review`.
2. Run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`.
3. One commit with `TICKETS.md` and the report, using the `ats-git-commit` format with `[Epic <N>]` in place of `[ATS-<N>]`:

   ```
   (MODEL_NAME) docs [Epic <N>] add the epic <N> review and empty the findings lists
   ```

4. Do not push. Hand over to `/ats-git-ship`, which ships `ats/epic-<N>-review` branches without a `Closes` line.

---

## Step 9 — Report back

```
## Epic <N> closed

| Outcome | Count | Where |
|---|---|---|
| Extra AC | <n> | #<a>, #<b> |
| Hygiene ticket | <n> | #<n> ATS-<N> |
| Own ticket | <n> | … |
| Already covered / fixed | <n> | … |
| Dropped | <n> | … |
| Done now | <n> | … |

Report: docs/review-epic-<N>.md
Branch: ats/epic-<N>-review (<sha>), not pushed. Run /ats-git-ship to open the PR.
```

## Rules

- Confirm the triage with the developer before any GitHub write
- Every finding gets exactly one outcome, and the report lists all of them
- Never bundle unrelated findings into a feature ticket just to empty the list. If nothing fits, use the hygiene ticket
- Never edit a closed ticket's ACs, except ticking boxes for work its merged PR shows was done
- New tickets always go through `ats-create-ticket`
- Never push or open a PR from this skill
