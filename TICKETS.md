# Mini-ATS — tickets

Ordered by epic. Each epic ends with a **checkpoint**: run `epic-review`, test the app as both admin and customer, and ship to production before starting the next epic.

Ticket IDs are `ATS-<N>`, numbered in the order they are done. This file is the plan. The live tickets are GitHub issues, imported from this file with `/ats-create-ticket import`. New tickets are created with `/ats-create-ticket`.

---

## Epic 0 — Foundation

Lovable built the full UI with mock data from the spec in `docs/ui-spec.md`. The free credits ran out after the build, so Claude Code takes over from here. Lovable is not used after ATS-1.

### ATS-1 · chore · Full UI in Lovable with mock data, synced to GitHub

**Context**
The fastest way to a working base. Lovable built every screen with typed mock data. Epics 1–4 then replace the mock data with Supabase, ticket by ticket. Spec: `docs/ui-spec.md`. Visual reference: `docs/prototype.html`. Review: `docs/review-ats-1.md`.
Lovable never touches the backend: no Lovable Cloud, no Supabase connection, no migrations.

**Acceptance Criteria**
- [x] AC1: Built on Lovable's TanStack Start template: React, Vite, TypeScript (strict), Tailwind CSS, shadcn/ui, TanStack Router, TanStack Query, @dnd-kit
- [x] AC2: All pages built with mock data: login, pipeline, jobs, candidates, admin accounts
- [x] AC3: Lovable Cloud is not enabled for the project (checked in Lovable under More → Cloud on 10 October), and there are no Supabase files or references in the repo
- [x] AC4: Synced to a public GitHub repo
- [x] AC5: The code is reviewed against `docs/ui-spec.md`. Findings in `docs/review-ats-1.md`, fixes in ATS-2

**Scope Boundary**
In scope: all UI with mock data.
Out of scope: database, real auth.

### ATS-2 · chore · Take over from Lovable: tooling, CI, Vercel and UI fixes

**Context**
From here on all work happens in Claude Code, in feature branches and pull requests. This ticket fixes what blocks a clean handover and the gaps found in `docs/review-ats-1.md`. The app stays on TanStack Start. Do not add an SPA `vercel.json`.

**Acceptance Criteria**
- [ ] AC1: `CLAUDE.md`, `TICKETS.md`, `docs/` and `supabase/` are in the repo (added before this branch)
- [ ] AC2: npm only: `bun.lock` and `bunfig.toml` removed, `.npmrc` with `legacy-peer-deps=true`, `package-lock.json` committed. `npm ci` works on a clean checkout
- [ ] AC3: One formatting commit with `npx eslint . --fix` and nothing else. `.vercel` and `.wrangler` added to the ESLint ignores. `npm run lint` has no errors
- [ ] AC4: `isLinkedInUrl` uses the same rule as the database check `^https?://([a-z]+\.)?linkedin\.com/`, with tests for `https://linkedin.com` (rejected), `https://se.linkedin.com/in/x` (accepted) and a nested subdomain (rejected)
- [ ] AC5: A test for reading and writing the pipeline filters (`?job=&q=`)
- [ ] AC6: PR template in `.github/pull_request_template.md`
- [ ] AC7: GitHub Actions runs `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` on every pull request
- [ ] AC8: A second CI job starts a Postgres service, runs `supabase/tests/local_stub.sql`, every file in `supabase/migrations/` and `supabase/tests/rls_test.sql` with `psql -v ON_ERROR_STOP=1`. A failing check fails the job
- [ ] AC9: `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and `.env*.local` in `.gitignore`
- [ ] AC10: UI fixes:
  - The sidebar text "Prototyp med låtsasdata. Inget sparas." is removed
  - Customers see their company name in the header
  - Switching customer clears the job filter
  - In edit mode, the candidate dialog can add jobs but not remove existing links
  - `package.json` is named `mini-ats`
- [ ] AC11: Deployed to Vercel from GitHub (manual step). Reloading `/pipeline` on the live URL works
- [ ] AC12: Drag tested on a real phone (manual step). If scrolling the board starts a drag, `PointerSensor` is replaced with `MouseSensor`

### ATS-3 · feat · Swedish and English: move all UI text into translation files

**Context**
All UI text is hardcoded in Swedish today. Epics 1–4 add more text: login errors, account creation, validation and toasts. Moving the text out now costs one ticket; doing it later means finding every string twice. Swedish stays the default because the first customers are Swedish companies. English makes the tool usable for teams that hire internationally. Done right after ATS-2, before epic 1.

**Acceptance Criteria**
- [ ] AC1: `i18next` and `react-i18next` added (approved by this ticket). `src/locales/sv.json` is the default and source language, `src/locales/en.json` the second
- [ ] AC2: Translation keys are typed, so a missing or misspelled key fails `npx tsc --noEmit`
- [ ] AC3: Every user-facing string in `src/` comes from the locale files: pages, dialogs, buttons, toasts, empty and error states, validation messages, `aria-label`s, placeholders and page titles. Stage labels too
- [ ] AC4: Counts use i18next plurals (for example `{{count}} kort`), never manual if/else
- [ ] AC5: A language switcher (Svenska / English) in the user menu and on the login page. The choice is stored in a cookie, so the server renders the right language without a flash. `<html lang>` follows the choice
- [ ] AC6: Dates and numbers are formatted with `Intl` for the active language through one shared helper
- [ ] AC7: Errors from the data layer are codes (for example `card_not_found`), translated in the UI. The same convention is documented for Edge Functions and database errors in epic 1
- [ ] AC8: A Vitest test checks that `sv` and `en` have exactly the same keys and no empty values

**Scope Boundary**
In scope: all UI text, the switcher, date and number formatting.
Out of scope: translating user data (job titles, names, notes), more languages.

### ATS-4 · refactor · Replace hardcoded values with tokens and constants

**Context**
Nothing in the app code should be hardcoded: colours, sizes, spacing, text and magic numbers all come from one place. The Lovable code mostly follows this already, but a few values are inline. This ticket removes them so the rule in `CLAUDE.md` holds for the whole codebase.

**Acceptance Criteria**
- [ ] AC1: No arbitrary Tailwind values (`w-[230px]`, `text-[15px]`, `max-h-[90vh]` and the like) outside `src/components/ui/`. Sizes that the default scale does not cover become named tokens in `src/styles.css`, for example `--width-kanban-column`
- [ ] AC2: No raw colours outside `src/styles.css`. `src/lib/error-page.ts` uses the same palette values from one shared definition
- [ ] AC3: Magic numbers move to named constants in `src/lib/constants.ts`: mock delay, days before a card counts as stale, drag activation distance and delay, minimum password length, and similar
- [ ] AC4: The checks used by `ats-epic-review` for arbitrary values, raw colours and hardcoded text find nothing outside the allowed exceptions

**Scope Boundary**
In scope: existing code outside `src/components/ui/` (shadcn/ui is vendored code and keeps its own classes).
Out of scope: visual redesign.

### ATS-20 · refactor · Move Lovable page parts into feature folders and add a code structure rule

Tracked in #22. Run after ATS-4 and before the epic 0 review.

**Checkpoint:** the app is live on Vercel with mock data in Swedish and English, the repo is public and CI is green.

---

## Epic 1 — Accounts and access

### ATS-5 · feat · Supabase project, database schema and RLS

**Context**
All security rests on this. Customers must never see each other's data.

**Acceptance Criteria**
- [ ] AC1: Supabase project created in an EU region (Stockholm, `eu-north-1`), because candidate data is personal data
- [ ] AC2: `supabase/migrations/20261006000000_init.sql` (added with the docs before ATS-2) applied to the project
- [ ] AC3: `supabase/tests/rls_test.sql` run in the Supabase SQL Editor. All 12 checks print `OK`
- [ ] AC4: Public sign-up disabled in Supabase Auth settings
- [ ] AC4b: The trigger errors in the migration raise codes instead of Swedish text (`job_candidate_customer_mismatch`, `application_not_found`), so the UI can translate them. Done before the migration is applied, and `rls_test.sql` still passes
- [ ] AC5: `@supabase/supabase-js` added, client in `src/integrations/supabase/client.ts` reading `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Same variables set in Vercel
- [ ] AC6: Types generated with the Supabase CLI into `src/integrations/supabase/types.ts`
- [ ] AC7: First admin created in the dashboard, then promoted with SQL:
  `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '<email>';`
  `update public.profiles set role = 'admin' where email = '<email>';`

**Scope Boundary**
Out of scope: UI.

### ATS-6 · feat · Login, logout and protected routes

**Acceptance Criteria**
- [ ] AC1: The mock in `AuthContext` is replaced by Supabase Auth. Pages are not changed
- [ ] AC2: Login with email and password, Swedish error messages
- [ ] AC3: The role is read from the user's own `profiles` row
- [ ] AC4: Signed-out users are redirected to login from every other page
- [ ] AC5: Customers cannot reach admin pages, also not by typing the URL
- [ ] AC6: Logout clears the session and the TanStack Query cache, and returns to login
- [ ] AC7: `DemoLogin` is removed

**Scope Boundary**
Out of scope: sign-up and password reset.

### ATS-7 · feat · Edge Function `admin-create-user`

**Context**
Creating users needs the service role key, so it has to run on the server.

**Acceptance Criteria**
- [ ] AC1: Verifies that the caller is a signed-in admin by calling `is_admin()` with the caller's JWT, otherwise returns 403
- [ ] AC2: Creates the user with `email_confirm: true`, password, `user_metadata` (full_name, company_name) and `app_metadata.role`, so the profile trigger gets everything at insert
- [ ] AC3: Validates input and returns a clear Swedish error if the email already exists
- [ ] AC4: Handles CORS, including `OPTIONS` preflight
- [ ] AC5: Service role key only read from Supabase secrets

### ATS-8 · feat · Admin page: list and create accounts

**Acceptance Criteria**
- [ ] AC1: Table of all accounts with name, company, email, role and creation date
- [ ] AC2: Form to create an admin or customer account, using `admin-create-user`
- [ ] AC3: The new account appears in the list without a page reload
- [ ] AC4: The new account can log in right away

**Checkpoint:** as admin, create a customer. Log in as the customer. Confirm the customer cannot open the admin page.

---

## Epic 2 — Jobs and candidates

### ATS-9 · feat · Jobs: list, create, edit, close

**Acceptance Criteria**
- [ ] AC1: List of the customer's jobs with title, location, status and number of candidates
- [ ] AC2: Create and edit a job: title, description, location
- [ ] AC3: Close and reopen a job
- [ ] AC4: Loading, empty and error states

### ATS-10 · feat · Candidates: list, create, edit

**Acceptance Criteria**
- [ ] AC1: List of the customer's candidates
- [ ] AC2: Create and edit a candidate: name, email, phone, LinkedIn URL, notes
- [ ] AC3: The LinkedIn URL is validated and opens in a new tab
- [ ] AC4: When creating a candidate, choose one or more jobs to link them to
- [ ] AC5: If linking fails after the candidate is created, the user sees an error and the candidate is still saved. Noted as a tradeoff in the PR

### ATS-11 · feat · Link a candidate to a job

**Acceptance Criteria**
- [ ] AC1: From the candidate view, add the candidate to another job
- [ ] AC2: New applications start in the `new` stage
- [ ] AC3: The same candidate cannot be added to the same job twice, with a clear Swedish message

**Checkpoint:** customer A creates jobs and candidates. Log in as customer B and confirm none of A's data is visible.

---

## Epic 3 — Kanban

### ATS-12 · feat · Compact kanban board

**Acceptance Criteria**
- [ ] AC1: One column per stage: Ny, Screening, Intervju, Erbjudande, Anställd, Avböjd
- [ ] AC2: Compact cards: candidate name, job title, days in stage from `stage_changed_at`
- [ ] AC3: Drag a card to another column to change stage. Optimistic update with rollback on error. The change survives a reload
- [ ] AC4: Clicking a card opens a side panel with the candidate details
- [ ] AC5: Scrolls horizontally on mobile, and drag works with touch

### ATS-13 · feat · Filter the board by job and candidate name

**Acceptance Criteria**
- [ ] AC1: Dropdown to filter on one job, or all jobs
- [ ] AC2: Search field that filters on candidate name as you type
- [ ] AC3: Filters are kept in the URL as `?job=&q=` so a filtered view can be shared or reloaded
- [ ] AC4: Clear message when no cards match

**Checkpoint:** a customer can go from a new job to a hired candidate on the board.

---

## Epic 4 — Admin acting for a customer

### ATS-14 · feat · Customer switcher for admins

**Acceptance Criteria**
- [ ] AC1: Admins see a customer picker in the header. Customers never see it
- [ ] AC2: Choosing a customer makes every page show and edit that customer's jobs, candidates and board
- [ ] AC3: A clear banner shows which customer the admin is acting for
- [ ] AC4: Everything created in that mode belongs to the selected customer
- [ ] AC5: Switching customer never shows the previous customer's cached data

**Checkpoint:** as admin, create a job and a candidate for customer A. Log in as A and confirm they are there.

---

## Epic 5 — Ready to deliver

### ATS-15 · chore · Demo data

**Acceptance Criteria**
- [ ] AC1: Seed script with two customers, a few jobs and about 15 candidates spread across the stages
- [ ] AC2: Users are created through the Auth admin API so the profile trigger runs. The script runs locally with the service role key from `.env.local` and is never committed with secrets
- [ ] AC3: Only obviously fake people and data
- [ ] AC4: A separate admin account and one customer account for the reviewers

### ATS-16 · docs · README

**Acceptance Criteria**
- [ ] AC1: What the app does, the stack, how to run it locally
- [ ] AC2: How it was built: Lovable built the UI from my spec, then Claude Code took over when the free Lovable credits ran out. Claude Code wrote the rest of the code, I directed, tested and set the rules
- [ ] AC3: Security model: RLS, roles, why the service role key only lives in Edge Functions, and how it was tested (`supabase/tests/rls_test.sql`)
- [ ] AC4: Key decisions and tradeoffs
- [ ] AC5: Assumptions, what is out of scope and what I would do next

### ATS-21 · chore · Small hygiene fixes from epic 0

Tracked in #25.

### ATS-22 · chore · Explicit table grants instead of Supabase default privileges

Tracked in #31.

### ATS-23 · chore · Length checks in the database for job and candidate text

Tracked in #36.

### ATS-24 · fix · Make saves fail with an error when offline instead of hanging

Tracked in #40.

### ATS-25 · fix · Keep an admin's chosen customer across reloads

Tracked in #43.

### ATS-26 · feat · Delete a job without candidates, and delete a candidate

Tracked in #45.

### ATS-27 · feat · Edit, delete and restore accounts, with 30 days to undo a delete

Tracked in #52.

### ATS-28 · fix · Give accounts created as admin the admin role

Tracked in #54.

### ATS-29 · feat · Use the Mini-ATS mark as the app logo and favicon

Tracked in #57.

### ATS-30 · feat · Remove a candidate's job link

Tracked in #59.

**Checkpoint — ship version 1 to the reviewers:** admin login, customer login and repo link, plus a short note on the status.

---

## Epic 6 — Extra: AI assessment of CVs

### ATS-17 · feat · Upload a CV to a candidate

**Acceptance Criteria**
- [ ] AC1: Upload a PDF to the private `cvs` bucket under `<customer_id>/<candidate_id>.pdf`
- [ ] AC2: The `cvs` bucket has a server-side size limit (5 MB) and only allows `application/pdf`
- [ ] AC3: The CV can be opened from the candidate view through a short-lived signed URL
- [ ] AC4: A CV path outside the candidate's own customer folder is rejected by the database (already in the schema)

### ATS-18 · feat · Edge Function `assess-cv`

**Context**
Gives the recruiter a quick first read of a CV against a job. A suggestion, never a decision.

**Acceptance Criteria**
- [ ] AC1: Reads the application with the caller's JWT, so RLS decides access
- [ ] AC2: Downloads the CV with the caller's JWT, never with the service role key, and extracts the text
- [ ] AC3: Asks an LLM for structured JSON: score 1–10, summary, strengths, gaps. The JSON is validated before it is saved
- [ ] AC4: The prompt tells the model to ignore name, age, gender, photo and anything else not relevant to the job
- [ ] AC5: Saves the result in `cv_assessments` with the service role key. Clients can only read assessments
- [ ] AC6: API key only in Supabase secrets

### ATS-19 · feat · Show the assessment

**Acceptance Criteria**
- [ ] AC1: "Bedöm CV" button in the candidate side panel
- [ ] AC2: Shows score, summary, strengths and gaps
- [ ] AC3: Clearly labelled as an AI suggestion

### ATS-31 · feat · Offer to reject a hired candidate's other open applications

Tracked in #62.

### ATS-32 · chore · Small hygiene fixes from epic 5

Tracked in #63.

### ATS-33 · fix · Make the last-admin check safe against two admins at once

Tracked in #64.

### ATS-34 · feat · Let a signed-in user change their own password

Tracked in #67.

**Checkpoint — ship version 2 to the reviewers:** Loom demo (5 min) and the assumptions email, updated to match what was built. If the AI feature is not done, explain the approach in the demo instead.

---

## Epic 7 — Safety net

The code test is done: the submitted version is the tag `v1.0-submission`. Mini-ATS continues as a portfolio project. Before the big rewrites in epics 8 and 9, end-to-end tests cover the main flows, so a rewrite that breaks one is caught in CI.

### ATS-35 · chore · Small hygiene fixes from epic 6

Tracked in #74.

### ATS-36 · chore · End-to-end test setup with Playwright and a local Supabase

Tracked in #79.

**Context**
The unit, Deno and RLS tests check the parts. Nothing checks that sign-in, the board and acting for a customer work together in a real browser against a real Supabase. The tests run against a local Supabase started in CI, so they get a fresh database on every run and never touch the project.

**Acceptance Criteria**
- [ ] AC1: `@playwright/test` is added as a dev dependency, with the developer's approval
- [ ] AC2: `supabase/config.toml` is added, so `npx supabase start` runs the stack locally: Auth with public sign-up disabled, Storage and the Edge Functions
- [ ] AC3: A test seed creates an admin and two customers (A and B) with a few jobs, candidates and cards. It is separate from the demo seed and runs only against the local stack
- [ ] AC4: A new CI job starts the local stack, applies the migrations, seeds it, builds the app against it and runs Playwright. A failed run uploads the trace
- [ ] AC5: A first test signs in as a customer and sees the board, and `npm run test:e2e` runs the suite locally
- [ ] AC6: The README's Quality and CI section and Scripts table describe the new job and command

**Scope Boundary**
In scope: the setup and one sign-in test.
Out of scope: the flows themselves (ATS-37).

### ATS-37 · test · End-to-end tests for the main flows

Tracked in #80.

**Context**
The flows a customer and an admin use every day, tested in a real browser, so the rewrites in epics 8 and 9 can't break them unnoticed.

**Acceptance Criteria**
- [ ] AC1: Customer: create a job and a candidate linked to it, and see the card in New
- [ ] AC2: Customer: move a card by mouse and by keyboard, and the move survives a reload
- [ ] AC3: Customer: the job and name filters are kept in the URL and survive a reload
- [ ] AC4: Admin: choose customer A, see A's board, switch to B and see only B's data, with nothing from A left on screen
- [ ] AC5: Customer B never sees customer A's jobs, candidates or cards
- [ ] AC6: Admin: delete an account, see it in Deleted accounts, restore it, and the customer can sign in again
- [ ] AC7: The tests are independent: each creates the data it needs, and they can run in any order

**Scope Boundary**
In scope: the flows above.
Out of scope: the AI assessment, which calls an outside model.

**Checkpoint:** the e2e job is green in CI and required before a merge.

---

## Epic 8 — Own pipeline stages

A customer shapes their own board: rename, add, remove and reorder the columns. Design and decisions: `docs/next-custom-stages.md`.

### ATS-38 · feat · Pipeline stages per customer in the database

Tracked in #81.

**Context**
Today the six stages are a fixed check on `applications.stage`. This ticket moves them into a table per customer, without changing what the app shows. Backwards compatible: the code on `main` and the submitted version keep working until ATS-42.

**Acceptance Criteria**
- [ ] AC1: A `pipeline_stages` table as described in `docs/next-custom-stages.md`, with RLS, explicit grants and `unique (id, customer_id)`
- [ ] AC2: `applications.stage_id` references `pipeline_stages (id, customer_id)` with `on delete restrict`, so a card only points at its own customer's column and a column with cards can't be removed
- [ ] AC3: Every existing customer gets the six default stages and every card its `stage_id`. New customers get the defaults in a trigger
- [ ] AC4: Kind rules: exactly one `hired` and at least one `rejected` stage per customer, with the error codes `stage_hired_required` and `stage_rejected_required`. Names are unique per customer and have a length limit. At most `MAX_PIPELINE_STAGES` (10) stages
- [ ] AC5: `stage` and `stage_id` stay in sync both ways, and `stage_changed_at` updates when either changes
- [ ] AC6: `move_application` and a new `reorder_stages` take stage ids, under the same advisory lock per customer
- [ ] AC7: `rls_test.sql` checks that customer B cannot read, create, rename, reorder or delete A's stages, or move a card to one of them

**Scope Boundary**
In scope: the database and its tests.
Out of scope: any change in the app (ATS-39).

### ATS-39 · refactor · Read the pipeline stages from the database

Tracked in #82.

**Context**
The app still uses the fixed list in `src/lib/stages.ts`. This ticket reads each customer's stages from the database instead, with no visible change for the six default stages.

**Acceptance Criteria**
- [ ] AC1: `src/lib/api/` and a hook read the stages with the query key `["stages", customerId]`
- [ ] AC2: The board, the side panel, the keyboard moves and the filters use stage ids instead of the fixed list
- [ ] AC3: Default stages keep their translated names (`stages.<default_key>`). A name the customer typed is shown as it is
- [ ] AC4: The Hired prompt uses the stage `kind`, and moves cards to the first rejected stage by position
- [ ] AC5: The demo seed and the tests use the new shape

### ATS-40 · feat · Rename, add, remove and reset stages

Tracked in #83.

**Context**
The customer, or an admin acting for them, edits the columns from the board.

**Acceptance Criteria**
- [ ] AC1: A menu on each column header: rename, change colour and remove
- [ ] AC2: Remove is disabled with a hint while the column has cards
- [ ] AC3: An Add column button, disabled with a hint at 10 columns
- [ ] AC4: Reset brings back the six defaults, and refuses with the same hint while a column it would remove has cards
- [ ] AC5: The colours come from a fixed palette of stage tokens
- [ ] AC6: Every error code from the database has a translated message in both languages

### ATS-41 · feat · Reorder the columns by drag and drop and by keyboard

Tracked in #84.

**Acceptance Criteria**
- [ ] AC1: Columns can be dragged by their header with @dnd-kit sortable, by mouse and touch
- [ ] AC2: The same move works by keyboard, with announcements in Swedish and English
- [ ] AC3: The new order is saved through `reorder_stages`, optimistically with rollback on a failed save
- [ ] AC4: Works at 390 px

### ATS-42 · chore · Drop the old stage column and retire the submission URL

Tracked in #85.

**Context**
Once no code on `main` uses `applications.stage`, it is dropped. This is the first migration the submitted version can't run against, so the submission URL is retired in the same ticket. The tag and release `v1.0-submission` keep the submitted code.

**Acceptance Criteria**
- [ ] AC1: A migration drops `applications.stage`, its check and the sync trigger from ATS-38
- [ ] AC2: The `mini-ats-submission.vercel.app` domain is removed in Vercel by the developer
- [ ] AC3: The README and `CLAUDE.md` point only to the tag and the release, and the `CLAUDE.md` line about a shared Supabase project is removed

**Checkpoint:** a customer renames, adds, removes and reorders columns, and an admin does the same for them.

---

## Epic 9 — Teams

Several users per company instead of one shared login.

### ATS-43 · docs · Design sketch for teams

Tracked in #86.

**Context**
Today `customer_id` is the customer's own user id, and every RLS policy, query key and Edge Function builds on that. Teams change it, so the design is decided and approved before anything is built.

**Acceptance Criteria**
- [ ] AC1: `docs/next-teams.md` decides what `customer_id` means: a company id in a new `companies` table, or the first user's id
- [ ] AC2: It describes the membership table, the roles inside a company (if any), and how RLS, `ActiveCustomerContext`, the Edge Functions and the deleted-accounts flow change
- [ ] AC3: It splits the work into tickets, which replace ATS-44–46 below

### ATS-44 · feat · Teams in the database

Defined by ATS-43.

### ATS-45 · feat · Teams in the data layer and contexts

Defined by ATS-43.

### ATS-46 · feat · Manage a company's members

Defined by ATS-43.

**Checkpoint:** two users in the same company see the same board; a user in another company sees none of it.

---

## Epic 10 — Audit log

### ATS-47 · feat · Audit log in the database

Tracked in #87.

**Context**
Who moved, changed or deleted what, and when. Written by the database so the app can't skip it.

**Acceptance Criteria**
- [ ] AC1: An `audit_events` table: customer, actor, action, the row it concerns, a small before/after and the time
- [ ] AC2: Written only by triggers on jobs, candidates and applications. Clients can only read it, through RLS per customer
- [ ] AC3: `rls_test.sql` checks that customer B cannot read A's events and that no client can write one

### ATS-48 · feat · Show the history

Tracked in #88.

**Acceptance Criteria**
- [ ] AC1: A history tab in the candidate side panel: stage moves, edits and job links, newest first
- [ ] AC2: Admins see the history of an account
- [ ] AC3: Loading, empty and error states, and text in both languages

**Checkpoint:** every move on the board shows up in the candidate's history.

---

## Epic 11 — Email

### ATS-49 · chore · Send Auth emails through our own SMTP provider

Tracked in #89.

**Context**
Supabase's built-in email is only meant for testing. Invites and password reset need a real provider.

**Acceptance Criteria**
- [ ] AC1: A provider is chosen with the developer (for example Resend) and set up as custom SMTP in Supabase Auth
- [ ] AC2: The email templates exist in Swedish and English
- [ ] AC3: No keys in the repo

### ATS-50 · feat · Invite accounts by email

Tracked in #90.

**Acceptance Criteria**
- [ ] AC1: An admin creates an account by invite: the user gets an email and chooses their own password
- [ ] AC2: After epic 9, a company invites its own members the same way
- [ ] AC3: An expired or used invite shows a clear error

### ATS-51 · feat · Reset a forgotten password

Tracked in #91.

**Acceptance Criteria**
- [ ] AC1: "Glömt lösenord?" on the sign-in page sends a reset email
- [ ] AC2: The answer is the same whether the email exists or not
- [ ] AC3: A deleted account can't reset its password

**Checkpoint:** a new customer is invited, signs in, forgets the password and resets it.

---

## Epic 12 — A customer's own theme

A customer can choose to make Mini-ATS feel like their own app, with their colour, logo and background image. Design and decisions: `docs/next-branding.md`.

### ATS-52 · feat · Branding per customer in the database

Tracked in #92.

**Acceptance Criteria**
- [ ] AC1: A `customer_branding` table, one row per customer, with RLS and explicit grants, as described in `docs/next-branding.md`
- [ ] AC2: A private `branding` bucket with a folder per customer, and server-side limits on file type and size
- [ ] AC3: `rls_test.sql` checks that customer B cannot read or change A's branding or files

### ATS-53 · feat · Apply a customer's theme in the app

Tracked in #93.

**Acceptance Criteria**
- [ ] AC1: The theme is read with the query key `["branding", customerId]` and applied at runtime on the app shell
- [ ] AC2: The text colour on the accent is chosen by a WCAG contrast check, with unit tests
- [ ] AC3: An admin acting for a customer sees the customer's theme, and the acting banner keeps the Mini-ATS colours
- [ ] AC4: The sign-in page and a customer without branding look as today

### ATS-54 · feat · Settings page for the theme

Tracked in #94.

**Acceptance Criteria**
- [ ] AC1: Settings → Appearance, for the customer and for an admin acting for them
- [ ] AC2: Choose a preset palette, or a custom colour that is refused if it fails the contrast check
- [ ] AC3: Upload a logo, shown in the sidebar in place of the Mini-ATS mark
- [ ] AC4: Reset to the default theme
- [ ] AC5: A preview before saving, and text in both languages

### ATS-55 · feat · Background image

Tracked in #95.

**Acceptance Criteria**
- [ ] AC1: Upload a background image, shown behind the content with a dim level the customer picks
- [ ] AC2: Cards, tables and panels keep solid backgrounds, so text never sits on the image, and contrast still passes
- [ ] AC3: Works at 390 px, and the page stays fast: the image is sized and cached
- [ ] AC4: The demo seed uses a made-up brand. No real company's logo or images go in the repo

**Checkpoint:** a customer with a theme and a customer without one both look right, as themselves and when an admin acts for them.

---

## Found while building

Small problems and improvements noticed while working on a ticket but outside its scope. Add one line per finding as soon as it is found, with the ticket where it was found. At each epic checkpoint the list is triaged and emptied: a finding becomes an extra AC on the open ticket that touches the same code, or goes into one hygiene ticket for the epic, or is dropped. The AC says where it came from, for example "(found while building ATS-2)". `/ats-epic-close` does the triage and records where each line went in `docs/review-epic-<N>.md`.

Format: `- [ ] <What is wrong or could be better> — <file or page> (found in ATS-<N>)`

## Found while reviewing PRs

Findings from `/ats-review-pr`. Blockers and real bugs are fixed on the branch before the merge; they do not go here. Small things (🟢 suggestions, and 🟡 warnings that are not quick to fix) get one line each, so they are not forgotten. They are triaged at the epic checkpoint like the list above, with ACs that say "(found in the PR review of ATS-3, PR #21)".

Format: `- [ ] <What could be better> — <file> (PR #<n>, ATS-<N>)`

