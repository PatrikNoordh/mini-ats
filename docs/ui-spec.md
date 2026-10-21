# UI spec — Mini-ATS

The specification for the frontend. Visual reference: `docs/prototype.html` (open it in a browser).

Lovable built the UI from this spec in ATS-1. The free Lovable credits ran out after the build, so Claude Code reviews the result against this spec and fixes the gaps in ATS-2.

## Goal

The frontend for a mini ATS (applicant tracking system) for small Swedish companies that recruit. Clean, fast and ready to show a first customer.

Until epic 1 the UI runs on **typed mock data in memory**. Epics 1–4 replace the mock with Supabase. The spec is written so that swap only touches `src/lib/api/` and `src/contexts/AuthContext.tsx`.

## Ground rules

- UI text in Swedish by default, with English as a second language through i18n (ATS-3). Code, file names and comments in English.
- React, TypeScript (strict), Tailwind, shadcn/ui, TanStack Query. @dnd-kit for drag and drop, with pointer and touch sensors. (The spec asked for React Router. Lovable used its TanStack Start template with TanStack Router instead, which is kept. See `docs/review-ats-1.md`.)
- No Supabase, no real authentication and no database before epic 1.

## Roles

- **Admin:** runs the platform. Creates admin and customer accounts. Can do everything a customer can do, on a customer's behalf.
- **Customer:** a recruiting company with one login. Creates jobs, adds candidates and moves them through a pipeline.

## Data model

TypeScript types in `src/types/index.ts`. Fields are snake_case to match the database. Dates are ISO strings.

- `Profile`: id, role (`"admin" | "customer"`), full_name, company_name, email, created_at
- `Job`: id, customer_id, title, description, location, status (`"open" | "closed"`), created_at
- `Candidate`: id, customer_id, full_name, email, phone, linkedin_url, notes, created_at
- `Application`: id, customer_id, job_id, candidate_id, stage, position, stage_changed_at, created_at, updated_at
  - stage: `"new" | "screening" | "interview" | "offer" | "hired" | "rejected"`
  - Swedish labels: Ny, Screening, Intervju, Erbjudande, Anställd, Avböjd

An application links one candidate to one job and is one card on the kanban board. A candidate can be linked to several jobs.

## Data access

- All data functions live in `src/lib/api/`, one file per entity: `profiles.ts`, `jobs.ts`, `candidates.ts`, `applications.ts`. They are async and take `customerId` as an explicit argument where data belongs to a customer.
- The data functions call Supabase (since epic 2). ATS-1 to ATS-9 used an in-memory mock store, `src/lib/api/mockStore.ts`, removed in ATS-10.
- TanStack Query hooks in `src/hooks/`: `useJobs`, `useCandidates`, `useApplications`, `useProfiles`, plus mutations.
- Every query key that returns customer data includes the active customer id, for example `["jobs", customerId]`. Switching customer must never show the previous customer's cached data.
- Moving a card uses an optimistic update and rolls back with a toast if the call fails. The database function `move_application` sets the stage and the card's position, last in its new column, in one call.
- Components never call Supabase directly.
- Demo data (ATS-15): `npm run seed:demo -- --yes` creates 1 admin (`admin@mini-ats.test`) and 2 customers through the Auth admin API, so the profile trigger runs: "Exempelbygg AB" (`kund@exempelbygg.test`, the reviewers' customer login) with 4 jobs and 9 candidates in every stage, and "Studio Exempel" (`kund@studioexempel.test`) with 3 jobs and 6 candidates. Only obviously fake people: `.test` email addresses, phone numbers in the range reserved for fiction, no LinkedIn links. The data lives in `scripts/demo-data.ts`; every run rebuilds the demo customers' jobs, candidates and cards and touches no other rows. Passwords are generated or taken from `DEMO_<KEY>_PASSWORD`, printed once and never committed.

## Auth (Supabase Auth, from ATS-6)

- `src/contexts/AuthContext.tsx` with `useAuth()` exposing: `user`, `profile`, `role`, `isLoading`, `signIn(email, password)`, `signOut()`. The Supabase calls live in `src/lib/api/auth.ts`.
- The role comes from the user's own `profiles` row. A user whose profile is missing, or fails to load at sign-in, is signed out again.
- The session is read in the browser only, so the server renders the loading state for protected pages.
- Route guards: `RequireAuth` redirects signed-out users to `/login?redirect=<the page they asked for>`, and login returns them there. Only a path inside the app is accepted (`src/lib/redirect.ts`). After a sign-out the guard goes to a bare `/login`, so the next account to sign in starts on `/pipeline`. `RequireAdmin` redirects customers to `/pipeline`.
- `signOut()` signs out on this device and clears the TanStack Query cache. The cache is also cleared whenever the signed-in user changes, for example after a sign-out in another tab.

## Active customer

- `src/contexts/ActiveCustomerContext.tsx`. For a customer it is always themselves. For an admin it is the customer chosen in a picker in the header.
- Every customer screen (jobs, candidates, pipeline) shows and creates data for the active customer only.
- An admin with no customer chosen sees "Välj en kund att arbeta som" with one card per customer instead of data. Each card shows the customer's number of open jobs, all fetched in one request. The chooser has loading, empty and error states, and a failed count shows an error with a retry while the customers can still be picked.
- Switching customer starts the page afresh, so no open panel or dialog from the previous customer carries over.
- A reload in the same tab keeps the admin's chosen customer (`sessionStorage`, stored with the admin's own id). The stored id is used only once it is in the admin's customer list; until the list is in, the page shows a loading state, and an id that is not in it is dropped. Logout and leaving customer mode forget the choice. A customer account never reads or writes it.
- When the customer list fails, the header picker shows an error with a retry instead of an empty list.
- An admin acting for a customer sees a banner: "Du arbetar som [företagsnamn]" with a button to leave.

## Pages

1. **`/login`:** email and password form with Swedish error messages.
2. **`/pipeline`** (start page after login, unless the user asked for another page), the kanban board:
   - One column per stage, in order. The column header shows the stage name and the number of cards.
   - Compact cards: candidate name, job title, and days in the current stage computed from `stage_changed_at`. Small enough that many fit on screen.
   - Drag a card to another column to change its stage. Changing stage sets `stage_changed_at` to now.
   - With the keyboard: Tab to a card, Enter opens it, space picks it up, the left and right arrow keys move it one column, and space drops it. Escape cancels. Screen readers hear the moves in the chosen language.
   - Clicking a card opens a side sheet with the candidate's details, LinkedIn link (new tab), notes, and the jobs they are linked to.
   - Filters above the board: a job dropdown (all jobs or one job) and a name search that filters as you type. Both live in the URL as `?job=<job id>&q=<text>`. A hand-typed numeric search such as `?q=123` is kept as text, and each filter has a visually hidden label.
   - A clear empty state when no cards match.
   - The board scrolls horizontally on mobile.
3. **`/jobs`:** table with title, location, status and number of candidates. Create and edit in a dialog. Close and reopen a job. Delete a job from its edit dialog, after a confirm, only while no candidates are linked to it: otherwise a toast says to remove its candidates under Kandidater first (`job_has_candidates`), and the database refuses too.
4. **`/candidates`:** table with name, email and LinkedIn. Create and edit in a dialog: name, email, phone, LinkedIn URL (must be a linkedin.com URL), notes, and one or more jobs to link to. A new link starts in "Ny". Delete a candidate from its edit dialog, after a confirm that names them and how many jobs they are linked to. Their cards on the board and their assessments go with them.
5. **`/admin/accounts`:** admin only. Table with name, company, email, role and created date. A dialog to create an account: role, name, company, email and a temporary password.

## Layout and design

- Follow `docs/prototype.html` for layout, density and visual style.
- Left sidebar: Pipeline, Jobb, Kandidater, and for admins Konton. Collapses to a menu on mobile.
- Header: the active customer picker (admins only) and a user menu with logout.
- Calm B2B look: light neutral background, white surfaces, one accent color used sparingly, good contrast. No gradients.
- Desktop first, but every page works at 390 px wide.
- Every list and the board have loading, empty and error states.
- Customers never see or reach admin pages.

## Tests

Vitest unit tests for the pure helpers: days in stage, LinkedIn URL validation, and reading and writing the pipeline filters from the URL.
