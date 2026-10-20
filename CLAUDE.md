# CLAUDE.md — Mini-ATS

Read this file before every task. It defines what the project is, how it is built and the rules every change must follow.

## What this is

A small applicant tracking system (ATS) for companies that recruit. The goal is a product a first real customer could rely on: correct, secure and polished within its scope.

**Roles**

- **Admin** — runs the platform. Creates admin and customer accounts, and can do everything a customer can do, on the customer's behalf.
- **Customer** — a recruiting company with one login. Creates jobs, adds candidates and moves them through the pipeline.

**Core concepts**

| Concept | Table | Notes |
|---|---|---|
| Account | `profiles` | One row per user. `role` is `admin` or `customer`. |
| Job | `jobs` | Belongs to one customer. |
| Candidate | `candidates` | Belongs to one customer. Can be linked to several jobs. |
| Application | `applications` | Links a candidate to a job. One card on the kanban board. Has a `stage` and `stage_changed_at`. |
| CV assessment | `cv_assessments` | Optional AI feature. A suggestion for the recruiter, never a decision. |

**Pipeline stages, in order:** `new` → `screening` → `interview` → `offer` → `hired`, plus `rejected`.

## Context

- The repo is public. Never commit personal data, private correspondence or anything that is not part of the project.
- Deadline: Monday 26 October 2026 (extended from 12 October). Prefer finished and solid over fast and half-done. All seven epics, including the AI feature in epic 6, are in scope. Work through the tickets in order.
- The reviewers follow the repo while it is built and want to see the process step by step. Keep `main` deployable, ship each finished ticket through a PR, and keep commits, PR descriptions and issue updates clear enough for someone reading along.

## Quality bar

Quality over speed. Do every ticket the way a careful senior engineer would:

- **Correct:** every acceptance criterion verified, and the edge cases handled: empty and very long input, duplicates, failed and slow requests, and an admin acting for a customer.
- **Secure:** the security rules below, input validated with zod at every boundary, and no way for one customer to see or change another customer's data.
- **Tested:** unit tests for logic, an RLS check for every schema change, and the manual test steps actually run as admin and as customer.
- **Accessible:** a label on every input, controls reachable by keyboard, visible focus and enough contrast.
- **Consistent:** reuse existing components, tokens and patterns. UI text that is clear in both languages and uses the same words for the same things.
- **Clean:** clear names, small functions, no dead code, no leftover `console.log`, and no `TODO` without an issue.
- **Within scope:** quality means doing the ticket well, not doing more. Problems and ideas outside the ticket go in `TICKETS.md` § Found while building, one line each, and are triaged into tickets at the epic checkpoint. PR reviews work the same way: blockers and real bugs are fixed on the branch before merging, and small findings go in `TICKETS.md` § Found while reviewing PRs.
- **Self-reviewed:** before the summary, read the whole diff (`git diff origin/main...HEAD`) as a strict reviewer and fix what you find.

## Stack

- TanStack Start (React 19, Vite, server rendering through Nitro) from Lovable's template. Auth and data load in the browser; the server only renders the page shell
- TanStack Router with file-based routes in `src/routes/`. `src/routeTree.gen.ts` is generated: never edit it by hand
- TypeScript (strict), Tailwind CSS, shadcn/ui
- TanStack Query for data fetching, @dnd-kit for drag and drop, zod for search params and forms
- Vitest for unit tests
- npm with `package-lock.json` (`.npmrc` sets `legacy-peer-deps=true`). Do not use bun
- Supabase: Postgres, Auth, Storage, Edge Functions
- Hosting: Vercel, deployed from `main`, with a preview per pull request
- Schema and RLS: `supabase/migrations/`. RLS tests: `supabase/tests/rls_test.sql`. Generated types: `src/integrations/supabase/types.ts`

## Reference docs

- GitHub Issues: the live tickets and their status, one milestone per epic. Titles start with `[ATS-<N>]`.
- `TICKETS.md`: the original plan, imported into GitHub Issues with `/ats-create-ticket import`.
- `docs/ui-spec.md`: what the UI does. `docs/prototype.html`: how it looks (open it in a browser). `docs/review-ats-1.md`: review of the Lovable code. `docs/review-epic-<N>.md`: each epic review and where its findings went.
- `supabase/migrations/`: the schema. `supabase/tests/rls_test.sql`: the security tests.

## Security rules — never break these

1. **The service role key is only used in Edge Functions.** Never import it, read it or reference it in `src/`.
2. **Edge Functions read with the caller's JWT.** Use the service role key only for the one privileged action the function exists for (creating a user, saving an assessment). Never use it to read data on behalf of a user.
3. **Public sign-up is disabled.** Accounts are only created by an admin through the `admin-create-user` Edge Function, which checks that the caller is an admin before doing anything.
4. **`profiles.role` is the role that counts.** RLS reads it through `public.is_admin()`, and the app reads it from the user's own profile. `app_metadata.role` is set when the account is created so the trigger can copy it. Never read the role from `user_metadata`.
5. **Every table has Row Level Security.** Customers see only rows where `customer_id` is their own id. Admins see everything through `public.is_admin()`. A new table without RLS policies is a bug.
6. **Do not rely on the frontend for access control.** Hiding a button is UX, not security. RLS is the security.
7. **The database sets `customer_id` where it can.** `applications.customer_id` comes from the job and `cv_assessments.customer_id` from the application, both via triggers. Never trust a `customer_id` sent from the client for those tables.
8. **`cv_assessments` is read-only for clients.** Only `assess-cv` writes to it.
9. No secrets in the repo. Use `.env.local`, Vercel environment variables and Supabase secrets.

## How data access works

- Customers: every query is scoped to their own `customer_id`, and RLS enforces the same thing in the database.
- Admins acting for a customer: the app holds an **active customer** in `ActiveCustomerContext`. All customer screens read and write with that customer's id. For a customer, the active customer is always themselves.
- Keep Supabase calls in `src/lib/api/` (one file per table), wrapped in TanStack Query hooks in `src/hooks/`. Components never call Supabase directly.
- **Every query key that returns customer data includes the active customer id**, for example `["jobs", customerId]`. Switching customer must never show cached data from the previous customer.
- Auth lives in `AuthContext` (`useAuth()`). Logout clears the TanStack Query cache.

## Code structure

- **Route files** in `src/routes/` define the route (path, search param schema, guards) and the page component. Dialogs and page parts live in `src/components/<feature>/`, for example `src/components/jobs/JobDialog.tsx`.
- **One component per file**, named after the component.
- **Exception:** a small set of closely related components of the same kind may share one file named after the set, the way shadcn/ui does it: `States.tsx`, `Guards.tsx`, `LanguageSwitcher.tsx`.
- **A small helper** used only inside its own file may stay there.
- `src/components/ui/` is vendored shadcn/ui code and is exempt.

## No hardcoded values

Nothing in app code is hardcoded. Every value has one named source:

| What | Where it comes from |
|---|---|
| UI text | Translation keys via `t()`, in both `src/locales/sv.json` and `src/locales/en.json` (from ATS-3) |
| Colours | Theme tokens in `src/styles.css` (`bg-card`, `text-muted-foreground`, `bg-stage-*` …). Never hex, rgb or oklch in components |
| Spacing, sizes, radii, fonts | The Tailwind scale and the tokens in `src/styles.css`. No arbitrary values like `w-[230px]`; add a named token instead |
| Magic numbers | Named constants in `src/lib/constants.ts` (delays, thresholds, limits) |
| Config and URLs | `import.meta.env.VITE_*` for the frontend, `Deno.env.get` in Edge Functions |
| Errors from the server | Codes (for example `email_exists`) that the UI translates, as described in `docs/error-codes.md`. Never user-facing text from Edge Functions or the database |

Allowed exceptions: `src/components/ui/` (vendored shadcn/ui code), dynamic values computed at runtime (a drag transform), token definitions in `src/styles.css`, mock data and test fixtures. User data (job titles, names, notes) is never translated.

## UI

- UI text in Swedish and English through i18n. Swedish is the default. Code, comments, commits and docs in English.
- Every new string gets a key in both locale files in the same commit.
- Desktop first, but every screen must work at 390 px wide.
- The kanban board is **compact**: small cards showing candidate name, job title and days in the current stage (`stage_changed_at`). Details open in a side panel.
- Every list and board has a loading, empty and error state.

## Lovable and GitHub

- Lovable built the UI with mock data in ATS-1. It never had backend access: no Lovable Cloud, no Supabase connection, no migrations.
- Lovable leftovers stay unless a ticket says otherwise: `AGENTS.md`, `.lovable/`, `src/lib/lovable-error-reporting.ts` and the build wrapper `@lovable.dev/vite-tanstack-config`. Never add an SPA rewrite in `vercel.json`; Nitro builds for Vercel automatically.
- Lovable is not used after ATS-1. Do not suggest going back to it. Treat the Lovable code like any other code: improve it when a ticket touches it.
- All work happens in feature branches and is merged into `main` through pull requests. Never commit directly to `main`.
- `main` is always deployable. Vercel deploys it automatically.

## Workflow

- **Tickets:** GitHub issues titled `[ATS-<N>] ...`. One ticket per branch. PRs close their issue with `Closes #<n>`.
- **Skills:** the project skills in `.claude/skills/` run the workflow: `ats-create-ticket`, `ats-implement-ticket`, `ats-git-commit`, `ats-git-ship`, `ats-git-branch-and-ship`, `ats-review-pr`, `ats-epic-review`, `ats-epic-close`, `ats-audit-to-issues`. Use them instead of the personal skills with similar names.
- **Branch:** `ats/ATS-<N>-short-description`
- **Commit:** `(MODEL_NAME) <type> [ATS-<N>] description`. Types: feat, fix, style, refactor, chore, docs, test.
- **Commits are small and each one builds.** Order within a feature: database → data layer → UI.
- **Before every commit:** `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` must pass. The build does not type-check on this stack, so `tsc` is required.
- **Database changes** go in a new migration in `supabase/migrations/`, get a matching check in `supabase/tests/rls_test.sql`, and the test file is run before the PR.
- **Migrations reach the project before the merge.** A migration is never left to "apply later".
  - Migrations must be backwards compatible with the code on `main`, because they are applied before the PR is merged: add columns with a default or as nullable, and drop or rename only in a later migration once no code on `main` uses the old shape.
  - Before the merge, with the developer's yes, the migration is applied with `npx supabase db push`. Then the types are regenerated and compared: `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts && npx prettier --write src/integrations/supabase/types.ts`, then `git diff`. A diff is committed to the branch.
  - If the migration changes tables, policies or functions, the developer runs `supabase/tests/rls_test.sql` in the SQL Editor against the project, and the PR says it passed.
  - If a PR whose migration is already applied is closed without merging, a new migration reverts it.
- **The Supabase CLI** is always run as `npx supabase`. Read-only commands (`migration list`, `gen types`, `db push --dry-run`) are fine. Commands that write to the remote database (`db push`, `migration repair`) need the developer's yes every time.
- **Pull requests** target `main` with the template: what changed (database / API / UI), acceptance criteria covered, manual test steps, tradeoffs. CI must be green.
- **Ask before:** adding a dependency, changing the database schema outside a ticket, deleting files, writing to the remote database (`db push`, `migration repair`), pushing, or opening a PR. Running `/ats-git-ship` is the developer's request to push and open a PR.

## Working on your own

When a ticket is run without someone watching:

- One ticket per run. Create the branch, work through the acceptance criteria in order and commit as you go.
- If something is unclear, choose the option that best fits the spec and the quality bar, write the choice down in the summary and keep going. Stop only if the choice would break a security rule or change the schema.
- Never push, open a PR, merge or post to GitHub. Never delete files unless the ticket or the prompt that started the run names them.
- Finish with a summary: what was done, each acceptance criterion as done or not done, what was tested and how, and open questions.

## Definition of done

- All acceptance criteria in the ticket are met.
- Lint, type check, tests, build and CI pass.
- Tested manually as both a customer and an admin.
- If the ticket touches data: checked that customer A cannot see or change customer B's rows, and `rls_test.sql` passes if the schema changed.
- If the ticket adds a migration: it is applied to the project as described in § Workflow, and the types generated from the project have no diff.
- Nothing is described as working unless it was tested.
