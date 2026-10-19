---
name: ats-audit-to-issues
description: "Turn the blockers and real bugs from the latest Mini-ATS review into GitHub issues, one per finding, by calling ats-create-ticket for each. Use when asked to 'create tickets from the review', 'turn findings into issues' or 'send audit results to GitHub'. For the warnings and TICKETS.md findings at an epic checkpoint, use ats-epic-close instead."
argument-hint: "Optional: 'blockers' to create issues for blockers only"
---

# Review Findings → GitHub Issues — Mini-ATS

Reads the most recent review report in this conversation and creates one GitHub issue per finding.

Use it for findings that each need their own ticket: blockers and real bugs. At an epic checkpoint, the warnings and the small `TICKETS.md` findings go through `/ats-epic-close` instead, which adds them to existing tickets rather than creating one issue each.

**Every issue is created by running the `ats-create-ticket` skill.** Never call `gh issue create` directly. That keeps numbering, labels, milestones and templates the same as every other ticket.

The argument is: `$ARGUMENTS`

---

## Step 1 — Find the report

Look back in this conversation for the most recent output of one of these:

- `/ats-epic-review` (sections Blockers and Warnings)
- `/ats-review-pr` (the Issues table)
- any other code review or audit with severities

If there is none, stop:
> No review report found in this session. Run `/ats-epic-review` or `/ats-review-pr` first, then run `/ats-audit-to-issues`.

---

## Step 2 — Extract the findings

| Report severity | Issue type | Priority label |
|---|---|---|
| 🔴 Blocker / epic-review Blockers | `fix` or `chore` | `priority:high` |
| 🟡 Warning / epic-review Warnings | `fix` or `chore` | `priority:medium` |
| 🟢 Suggestion | `chore` | `priority:low` |

Type per finding:
- Security problem, runtime bug or broken acceptance criterion → `fix`, plus the `security` label for security findings
- Missing test, missing state, code quality, design token or hygiene → `chore`

If `$ARGUMENTS` is `blockers`, only take the blockers.

Show the list of findings that will become issues and wait for the developer to confirm before creating anything.

---

## Step 3 — Create the issues one by one

Run `ats-create-ticket` once per finding, blockers first, then warnings, then suggestions. Pass a complete description in this shape:

```
<fix|chore>: <short imperative title describing the fix>

Severity: <🔴 Blocker / 🟡 Warning / 🟢 Suggestion>
Labels: <priority:high|medium|low>, <security if relevant>
Milestone: <current epic>
File: <path:line if known>
Category: <Security / RLS / Data layer / TypeScript / UI / Tests / Hygiene>

Problem:
<The exact finding from the report>

Why it matters:
<One sentence on the risk>

Suggested fix:
<A targeted fix, not a rewrite>

Acceptance criteria:
- [ ] AC1: <the fix, testable>
- [ ] AC2: <the regression test or check that proves it>

Source: /ats-audit-to-issues from <report name>, <date>.
```

Example:

```
fix: Check Supabase error before using data in listJobs

Severity: 🔴 Blocker
Labels: priority:high
Milestone: Epic 2 — Jobs and candidates
File: src/lib/api/jobs.ts:8
Category: Data layer

Problem:
listJobs returns data without checking error. A failed query renders an empty list instead of the error state.

Why it matters:
The customer sees "Inga jobb än" when the real problem is a failed request, and cannot retry.

Suggested fix:
Throw when error is set so TanStack Query reaches the error state.

Acceptance criteria:
- [ ] AC1: listJobs throws when Supabase returns an error
- [ ] AC2: The jobs page shows ErrorState with "Försök igen" when the request fails

Source: /ats-audit-to-issues from /ats-epic-review 2, 2026-10-10.
```

`ats-create-ticket` runs its own duplicate check. If it finds the same problem already ticketed, skip the finding and note it.

---

## Step 4 — Report

```
## Issues created from <report name>

| Priority | ATS | Issue | Title |
|---|---|---|---|
| 🔴 high | ATS-N | #n | <title> |
| 🟡 medium | ATS-N | #n | <title> |

Total: N issues (X high, Y medium, Z low). Skipped: <findings skipped and why, or "none">.
```

## Rules

- Always go through `ats-create-ticket`. Never `gh issue create` directly
- One issue per finding. Never bundle findings
- Never create an issue for something that is not in the report
- Skip findings without a file or a clear description, and list them as skipped
- Never create duplicates
