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
- `PipelineStage` (ATS-38, read by the app since ATS-39): id, customer_id, name, default_key, position, kind (`"open" | "hired" | "rejected"`), colour
  - Every account starts with six default stages, keys `"new" | "screening" | "interview" | "offer" | "hired" | "rejected"`. A default keeps its translated name (`stages.<key>`; Swedish: Ny, Screening, Intervju, Erbjudande, Anställd, Avböjd) until the customer renames it; a typed name is user data and is never translated.
  - `kind` gives a stage its meaning: exactly one `hired`, at least one `rejected`.
- `Application`: id, customer_id, job_id, candidate_id, stage_id, position, stage_changed_at, created_at, updated_at

An application links one candidate to one job and is one card on the kanban board. A candidate can be linked to several jobs.

## Data access

- All data functions live in `src/lib/api/`, one file per entity: `profiles.ts`, `jobs.ts`, `candidates.ts`, `applications.ts`. They are async and take `customerId` as an explicit argument where data belongs to a customer.
- The data functions call Supabase (since epic 2). ATS-1 to ATS-9 used an in-memory mock store, `src/lib/api/mockStore.ts`, removed in ATS-10.
- TanStack Query hooks in `src/hooks/`: `useJobs`, `useCandidates`, `useApplications`, `useStages`, `useProfiles`, plus mutations.
- Every query key that returns customer data includes the active customer id, for example `["jobs", customerId]`. Switching customer must never show the previous customer's cached data.
- Moving a card uses an optimistic update and rolls back with a toast if the call fails. The database function `move_application` sets the stage and the card's position, last in its new column, in one call.
- Components never call Supabase directly.
- Demo data (ATS-15): `npm run seed:demo -- --yes` creates 1 admin (`admin@mini-ats.test`) and 2 customers through the Auth admin API, so the profile trigger runs: "Exempelbygg AB" (`kund@exempelbygg.test`, the reviewers' customer login) with 4 jobs and 9 candidates in every stage, and "Studio Exempel" (`kund@studioexempel.test`) with 3 jobs and 6 candidates. Only obviously fake people: `.test` email addresses, phone numbers in the range reserved for fiction, no LinkedIn links. The data lives in `scripts/demo-data.ts`; every run rebuilds the demo customers' jobs, candidates and cards and touches no other rows. Passwords are generated or taken from `DEMO_<KEY>_PASSWORD`, printed once and never committed.

## Auth (Supabase Auth, from ATS-6)

- `src/contexts/AuthContext.tsx` with `useAuth()` exposing: `user`, `profile`, `role`, `isLoading`, `signIn(email, password)`, `signOut()`. The Supabase calls live in `src/lib/api/auth.ts`.
- The role comes from the user's own `profiles` row. A user whose profile is missing, or fails to load at sign-in, is signed out again. The row gets its role from `app_metadata.role`, also when Auth sets it right after creating the user, as the Auth admin API does (ATS-28).
- The session is read in the browser only, so the server renders the loading state for protected pages.
- Route guards: `RequireAuth` redirects signed-out users to `/login?redirect=<the page they asked for>`, and login returns them there. Only a path inside the app is accepted (`src/lib/redirect.ts`). After a sign-out the guard goes to a bare `/login`, so the next account to sign in starts on `/pipeline`. `RequireAdmin` redirects customers to `/pipeline`.
- `signOut()` signs out on this device and clears the TanStack Query cache. The cache is also cleared whenever the signed-in user changes, for example after a sign-out in another tab.

## Active customer

- `src/contexts/ActiveCustomerContext.tsx`. The active customer is a company (ATS-45). For a customer user it is always their own company. For an admin it is the company chosen in a picker in the header. A customer user without an active company cannot sign in: **Kontot tillhör inget aktivt företag. Kontakta en administratör.**
- Every customer screen (jobs, candidates, pipeline) shows and creates data for the active customer only.
- An admin with no customer chosen sees "Välj en kund att arbeta som" with one card per customer instead of data. Each card shows the customer's number of open jobs, all fetched in one request. The chooser has loading, empty and error states, and a failed count shows an error with a retry while the customers can still be picked.
- Switching customer starts the page afresh, so no open panel or dialog from the previous customer carries over.
- A reload in the same tab keeps the admin's chosen customer (`sessionStorage`, stored with the admin's own id). The stored id is used only once it is in the admin's customer list; until the list is in, the page shows a loading state, and an id that is not in it is dropped. Logout and leaving customer mode forget the choice. A customer account never reads or writes it.
- When the customer list fails, the header picker shows an error with a retry instead of an empty list.
- An admin acting for a customer sees a banner: "Du arbetar som [företagsnamn]" with a button to leave.

## Pages

1. **`/login`:** email and password form with Swedish error messages.
2. **`/pipeline`** (start page after login, unless the user asked for another page), the kanban board:
   - One column per stage of the customer, in the customer's order (`pipeline_stages.position`). The column header shows the stage's colour, its name and the number of cards.
   - Editing the columns (ATS-40), for the customer and for an admin acting for them: a menu on each column header to rename it, pick a colour from the palette of eight, and remove it after a confirm. Remove does nothing while the column has cards, or is the only Hired, the last Rejected or the last open column, and the menu says why. Above the board, **Lägg till kolumn** opens a name dialog and adds an open column just before Hired and Rejected, in the first unused colour; it is disabled with a hint at 10 columns (`MAX_PIPELINE_STAGES`). **Återställ kolumner** brings back the six defaults after a confirm, keeping the cards in their columns; it is disabled while a column it would remove has cards, with a hint that names those columns and says a reset removes the columns the customer added. A name is required, at most 50 characters (`MAX_STAGE_NAME_LENGTH`) and not the name another column shows, translated defaults included.
   - A board without cards still shows its columns, under the empty-state text, so they can be set up before the first candidate.
   - Reordering the columns (ATS-41): each column header is a handle. Drag it by mouse or touch, or focus it, press space, move it with the left and right arrow keys and press space to drop it; Escape cancels. Screen readers hear where the column is ("plats 2 av 6") in the chosen language. The new order shows at once and is saved through `reorder_stages`; a failed save puts the old order back with a toast.
   - A new card, from the candidate dialog or Add to job, lands in the first open column by position (ATS-40).
   - Compact cards: candidate name, job title, and days in the current stage computed from `stage_changed_at`. Small enough that many fit on screen.
   - Drag a card to another column to change its stage. Changing stage sets `stage_changed_at` to now.
   - With the keyboard: Tab to a card, Enter opens it, space picks it up, the left and right arrow keys move it one column, and space drops it. Escape cancels. Screen readers hear the moves in the chosen language.
   - Moving a card to Hired (the stage of kind `hired`, whatever its name), by drag or by keyboard, is done at once. Once the move is saved (a failed hire never prompts), if the same candidate has other cards in a stage of kind `open`, in any job and not only the filtered ones, a prompt asks "<name> har även <n> andra öppna ansökningar. Flytta dem till Avböjd?" with **Behåll** (focused) and **Flytta till Avböjd**. Confirming moves exactly those cards to the first stage of kind `rejected`, by position, through `move_application`, one at a time; a toast says how many moved and how many failed, and the board refetches. A soft prompt, not a rule: one person can be hired for two roles (ATS-31).
   - Clicking a card opens a side sheet with the candidate's details, LinkedIn link (new tab), notes, CV, and the jobs they are linked to. The CV part uploads a PDF of at most 5 MB (`MAX_CV_BYTES`) to the private `cvs` bucket at `<customer_id>/<candidate_id>.pdf`, opens it in a new tab through a signed link that works for 5 minutes, replaces it, or removes it after a confirm (ATS-17). Last, a box with a dashed border, "AI-bedömning av CV" with the badge "AI-förslag" and a line saying it is a suggestion, not a decision: for each linked job the newest assessment (score out of 10, summary, strengths, gaps and the date) and a "Bedöm CV" button ("Bedöm igen" once assessed), which calls `assess-cv` in the app's language. The button is disabled without a CV, and while an assessment runs (ATS-19). An assessed job has a remove button that, after a confirm, removes that job's assessments and keeps the CV (ATS-56). Each linked job has a remove button that, after the same confirm as the candidate dialog, removes that card and keeps the candidate (ATS-30).
   - Filters above the board: a job dropdown (all jobs or one job) and a name search that filters as you type. Both live in the URL as `?job=<job id>&q=<text>`. A hand-typed numeric search such as `?q=123` is kept as text, and each filter has a visually hidden label.
   - A clear empty state when no cards match.
   - The board scrolls horizontally on mobile.
3. **`/jobs`:** table with title, location, status and number of candidates. Create and edit in a dialog. Close and reopen a job. Delete a job from its edit dialog, after a confirm, only while no candidates are linked to it: otherwise a toast says to remove its candidates under Kandidater first (`job_has_candidates`), and the database refuses too.
4. **`/candidates`:** table with name, email and LinkedIn. Create and edit in a dialog: name, email, phone, LinkedIn URL (must be a linkedin.com URL), notes, an optional CV (a PDF of at most 5 MB, uploaded after the candidate is saved and replacing any CV it has; ATS-17). The CV field says "Nuvarande CV" with a link to open it, or "Inget CV uppladdat", has a "Välj PDF" or "Byt CV" button, and once a file is chosen shows its name, that it replaces the current CV on save, and "Ångra valet" (ATS-32), and one or more jobs to link to. A new link starts in "Ny". Unticking a job the candidate is linked to removes that link when the dialog is saved, after a confirm that names the jobs and says their cards and any CV assessments go too; cancelling ticks them again. A closed job the candidate is linked to stays listed, so it can be unticked (ATS-30). Delete a candidate from its edit dialog, after a confirm that names them and how many jobs they are linked to. Their cards on the board and their assessments go with them.
5. **`/admin/accounts`:** admin only, companies and their users (ATS-46).
   - **Företag:** each active company with its users (name, email, role, created date), and **+ Lägg till användare**, **Byt namn** and **Ta bort**. A company without users says **Inga användare** and keeps all its data until an admin adds a user or deletes it. **+ Nytt företag** creates one. Company changes go through `admin-manage-company`.
   - **Användare utan företag:** customer accounts in no company. They see nothing and cannot sign in until they are placed. **Administratörer:** the admin accounts.
   - A dialog to create an account: role, name, company (for a customer: an existing company, or **+ Nytt företag** with its name), email and a temporary password. Opened from a company's card, the company is chosen. Clicking an account opens the same dialog to edit it: name, company (another one moves the user, **Inget företag** removes them), email, role and an optional new password (empty keeps it). Accounts go through `admin-create-user` and `admin-manage-account` (ATS-27). The company's name is changed on the company, never here.
   - **Ta bort** on an account asks first and names the date it is deleted for good. A deleted account is hidden, cannot sign in (the login page says the account is deleted) and gets no data even with an old session. The company's data stays, and its other users keep working.
   - **Ta bort** on a company asks first and names the date. The company is hidden from all its users at once, and none of them can sign in.
   - **Borttagna företag (n)** and **Borttagna konton (n)** show what is deleted, each with "Raderas för gott <date>" (30 days after the delete, `ACCOUNT_DELETE_GRACE_DAYS`), **Återställ**, and **Radera för gott**, which deletes it now after the admin types the company's name or the account's email. A company goes with all its jobs, candidates, cards and CV files and its users' accounts; an account goes with its login only. A daily job deletes what is past its 30 days.
   - An admin cannot delete or remove the admin role from its own account or the last active admin. Everything else is allowed, also for other admins.

## Layout and design

- Follow `docs/prototype.html` for layout, density and visual style.
- Left sidebar: Pipeline, Jobb, Kandidater, and for admins Konton. Collapses to a menu on mobile.
- Header: the active customer picker (admins only) and a user menu with the language, logout and **Byt lösenord** (ATS-34). That opens a dialog for the signed-in account, which names it (for an admin acting for a customer, the admin): current password, new password and the new password again. The new one follows the same rules as a password an admin sets and must differ from the current one. The current password is checked by signing in with it again; after the change the user's other sessions are signed out and this device stays signed in. A device whose session was ended elsewhere still holds a valid access token, so the app asks Auth when it loads, on each page change and each time its browser tab is shown again, and signs out when Auth says the session is gone (`session_not_found`). Offline, it stays signed in.
- Logo: the Mini-ATS mark (`docs/brand/`) next to the product name, in the sidebar and on the login page. `Logo.tsx` draws it with the theme colours; `public/favicon.svg` is the same mark, with `favicon.ico` as the fallback.
- Calm B2B look: light neutral background, white surfaces, one accent color used sparingly, good contrast. No gradients.
- Desktop first, but every page works at 390 px wide.
- Every list and the board have loading, empty and error states.
- Customers never see or reach admin pages.

## Tests

Vitest unit tests for the pure helpers: days in stage, LinkedIn URL validation, and reading and writing the pipeline filters from the URL.
