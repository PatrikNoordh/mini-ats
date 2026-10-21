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

**Checkpoint — ship version 2 to the reviewers:** Loom demo (5 min) and the assumptions email, updated to match what was built. If the AI feature is not done, explain the approach in the demo instead.

---

## Found while building

Small problems and improvements noticed while working on a ticket but outside its scope. Add one line per finding as soon as it is found, with the ticket where it was found. At each epic checkpoint the list is triaged and emptied: a finding becomes an extra AC on the open ticket that touches the same code, or goes into one hygiene ticket for the epic, or is dropped. The AC says where it came from, for example "(found while building ATS-2)". `/ats-epic-close` does the triage and records where each line went in `docs/review-epic-<N>.md`.

Format: `- [ ] <What is wrong or could be better> — <file or page> (found in ATS-<N>)`

- [ ] `npx prettier --check src` fails on `src/routes/README.md`, so the docs folder is not covered by a format check — `src/routes/README.md` (found in ATS-12)
- [ ] The header of the first migration says `rls_test.sql` has 13 checks; it now has more, and the count goes stale with every new check — `supabase/migrations/20261006000000_init.sql` (found in ATS-12)
- [ ] `@testing-library/react` is a dev dependency but its peer `@testing-library/dom` is missing, so it cannot be used; tests render with `react-dom/client` instead. Add the peer or drop the package — `package.json` (found in ATS-12)
- [ ] Every mutation except the card move uses TanStack Query's default `networkMode: "online"`, so offline a save is paused without an error and the dialog stays pending. Consider `networkMode: "always"` as the default for mutations — `src/router.tsx` (found in ATS-12)
- [ ] Dev server noise: `npm run dev` prints about 50 lightningcss "Unknown at rule @theme/@utility" warnings from tw-animate-css, plus a notice to replace vite-tsconfig-paths with `resolve.tsconfigPaths`. The app and animations work. Find the root cause and silence them without removing the Lovable build wrapper — `vite.config.ts` (found in ATS-12)

## Found while reviewing PRs

Findings from `/ats-review-pr`. Blockers and real bugs are fixed on the branch before the merge; they do not go here. Small things (🟢 suggestions, and 🟡 warnings that are not quick to fix) get one line each, so they are not forgotten. They are triaged at the epic checkpoint like the list above, with ACs that say "(found in the PR review of ATS-3, PR #21)".

Format: `- [ ] <What could be better> — <file> (PR #<n>, ATS-<N>)`

- [ ] The advisory lock in `move_application` was verified by hand with two sessions; no automated test runs two concurrent moves into one column — `supabase/tests/` (PR #38, ATS-12)
