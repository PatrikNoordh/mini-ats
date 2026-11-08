# Data safety map

How Mini-ATS keeps data from being lost, left half done, or seen or changed by another customer. It lists where each piece of data lives, what a delete takes with it, who may read and write what, which guard stops each mistake, and the test that proves the guard works.

`/ats-data-safety` keeps this map up to date (ATS-60). In diff mode, run by `/ats-review-pr`, it reads this map and only the chains a branch touches. In full mode, run by `/ats-epic-close`, it rebuilds the map from the schema, the policies, the Edge Functions and the scripts.

**Last full run:** 2026-11-08, on `main` at `76607a0` (after PR #115, ATS-57). Built from the 21 migrations applied to a fresh Postgres 17 database, with `supabase/tests/rls_test.sql` passing (checks 1–50).

**Rules for this file.** The repo is public, so this file holds no secrets, no real data and no open vulnerability. A gap is written down only once it has an issue or a line in `TICKETS.md`, and a gap that a customer could use against another customer goes to an issue with the `security` label first. Once there are real customers, such a gap goes to a private GitHub security advisory instead, and this file says only that one is open.

---

## 1. Where the data lives and what a delete takes with it

Every customer row carries `customer_id`. Today a customer is one login, so the same id names four things: the Auth user, the profile, the owner of every row, and the folder in the `cvs` bucket. Epic 9 splits them (`docs/next-teams.md`).

| Data                            | Owner key                                                        | References (on delete)                                                                                                                              | Deleting it also removes                                                                                              |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `auth.users`                    | `id`                                                             | —                                                                                                                                                   | its `profiles` row (cascade), and through it everything below. Not its CV files: Storage has no foreign key           |
| `profiles`                      | `id` = the Auth user's id                                        | `auth.users(id)` cascade                                                                                                                            | `jobs`, `candidates`, `applications`, `cv_assessments`, `pipeline_stages` of that customer (cascade on `customer_id`) |
| `jobs`                          | `customer_id`                                                    | `profiles(id)` cascade                                                                                                                              | nothing: a job with cards cannot be deleted (`applications.job_id`, no action)                                        |
| `candidates`                    | `customer_id`                                                    | `profiles(id)` cascade                                                                                                                              | their `applications` (cascade), and through them their `cv_assessments`. Not the CV file                              |
| `applications` (cards)          | `customer_id`, set from the job                                  | `candidates(id)` cascade · `jobs(id)` no action · `(stage_id, customer_id)` → `pipeline_stages(id, customer_id)` no action · `profiles(id)` cascade | their `cv_assessments` (cascade)                                                                                      |
| `cv_assessments`                | `customer_id`, set from the card                                 | `applications(id)` cascade · `profiles(id)` cascade                                                                                                 | nothing                                                                                                               |
| `pipeline_stages` (columns)     | `customer_id`                                                    | `profiles(id)` cascade                                                                                                                              | nothing: a column with cards cannot be deleted (the composite key, no action)                                         |
| `storage.objects`, bucket `cvs` | the first folder of the path, `<customer_id>/<candidate_id>.pdf` | none to the tables                                                                                                                                  | nothing. Private bucket, PDF only, at most 5 MB                                                                       |

**Why `no action` and not `restrict`** on the two keys that block a delete (ATS-38): `no action` is checked at the end of the statement, so an account delete, which removes the cards and the columns in the same statement, still goes through in any order. A single job or column with cards is still refused (`23503`).

**Rows kept in step by triggers, not by the client** (security rule 7):

- `applications.customer_id` comes from the job, and the job and the candidate must have the same customer (`job_candidate_customer_mismatch`).
- `cv_assessments.customer_id` comes from the card (`application_not_found` without one).
- A new card without a column lands in the customer's first open column (`applications_start_stage`).
- Clearing `cv_path` removes the candidate's assessments (`candidates_remove_assessments_with_cv`), since they were made from that file.
- `candidates.cv_uploaded_at` is stamped by the database, never by a client.
- Every new profile gets the six default columns (`profiles_default_stages`).

### The delete chains

| What is deleted      | How                                                                                 | Order, and what a failure leaves                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A card (job link)    | client delete on `applications`                                                     | one statement: the card and its assessment go together                                                                                                         |
| An assessment        | client delete on `cv_assessments` (ATS-56)                                          | one row; the CV stays                                                                                                                                          |
| A CV                 | `removeCandidateCv` in `src/lib/candidate-cv.ts`                                    | file first, then `cv_path`. A failure in between leaves a path to a missing file, which the next try clears; never a file nobody can see                       |
| A candidate          | the `delete-candidate` Edge Function, with the caller's JWT only (ATS-56)           | see § 4                                                                                                                                                        |
| A job                | client delete on `jobs`                                                             | only without cards (`23503` otherwise)                                                                                                                         |
| A column             | client delete on `pipeline_stages`                                                  | only without cards, and never the last open, the only Hired or the last Rejected column                                                                        |
| An account, soft     | `admin-manage-account`, `soft_delete_or_demote_account`                             | `deleted_at` is set under the last-admin lock, then the login is banned; if the ban fails, the mark is undone. Its data stays, hidden from everyone but admins |
| An account, for good | `admin-manage-account` "delete for good", or `purge-deleted-accounts` after 30 days | see § 4                                                                                                                                                        |

---

## 2. Who may read and write

### Rows (RLS) and table privileges

Every table in `public` has RLS on. Every policy has the same shape: the row's owner while their account is active, or an admin.

```
(customer_id = auth.uid() and account_is_active()) or is_admin()
```

`is_admin()` and `account_is_active()` read `profiles` (security rule 4: `profiles.role`, never `user_metadata`). A deleted admin is not an admin, and a deleted customer gets no rows.

| Table                      | Policies                                                                                                    | `authenticated` may            | Column grants (insert / update)                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | select own or admin; update admin                                                                           | select                         | none. Profile changes go through `admin-manage-account`, so the update policy has no grant behind it           |
| `jobs`                     | all, owner or admin                                                                                         | select, insert, update, delete | all columns                                                                                                    |
| `candidates`               | all, owner or admin                                                                                         | select, insert, update, delete | all columns. `cv_uploaded_at` is overwritten by the triggers                                                   |
| `applications`             | all, owner or admin                                                                                         | select, insert, update, delete | all columns. `customer_id` is overwritten by the trigger                                                       |
| `cv_assessments`           | select and delete, owner or admin                                                                           | select, delete                 | none: only `assess-cv` inserts (security rule 8)                                                               |
| `pipeline_stages`          | all, owner or admin                                                                                         | select, delete                 | insert `customer_id, name, position, kind, colour`; update `name, position, kind, colour`. Never `default_key` |
| `storage.objects` in `cvs` | select, insert, update, delete when the first folder is the caller's id and the account is active, or admin | Storage API                    | —                                                                                                              |

`anon` has no privilege on any table in `public`, also on tables added later (check 20).

### Security definer functions

Each runs with the owner's rights, so each checks for itself who may call it.

| Function                                                                                                                                                                                                                                                                           | Why definer                                                                                        | Who may run it                                 | Its own check                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `is_admin()`, `account_is_active()`                                                                                                                                                                                                                                                | read `profiles` from inside the policies without recursing into them                               | every role (used by RLS)                       | reads only the caller's own row                                                          |
| `reset_stages(customer_id)`                                                                                                                                                                                                                                                        | brings back a removed default column with its `default_key`, which clients may not insert (ATS-40) | `authenticated`                                | the table policy's rule, then `stage_not_found` for a customer the caller may not change |
| `soft_delete_or_demote_account(id, change)`                                                                                                                                                                                                                                        | the last-admin lock and the mark in one transaction                                                | `service_role` only                            | `last_admin`, `account_deleted`, `account_not_found`                                     |
| `accounts_due_for_purge()`                                                                                                                                                                                                                                                         | lists deleted accounts past 30 days                                                                | `service_role` only                            | —                                                                                        |
| `create_default_stages(customer)`                                                                                                                                                                                                                                                  | inserts `default_key`                                                                              | the owner only (called by the profile trigger) | —                                                                                        |
| Trigger functions: `handle_new_user`, `sync_role_from_app_metadata`, `handle_new_profile_stages`, `set_application_customer`, `set_assessment_customer`, `set_application_start_stage`, `remove_assessments_with_cv`, `pipeline_stages_before_write`, `check_pipeline_stage_kinds` | write or read past the caller's RLS                                                                | only as triggers                               | each reads only the row's own customer                                                   |

`add_stage`, `move_application` and `reorder_stages` are security invoker: RLS decides, as for any write.

### Edge Functions and the service role

Security rule 2: each function verifies the caller first and reads with the caller's JWT. The service role does only the one privileged action the function exists for.

| Function                 | Caller                                            | Service role used for                                                                                                    |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `admin-create-user`      | an admin, checked from `profiles`                 | creating the Auth user (public sign-up is off, rule 3)                                                                   |
| `admin-manage-account`   | an admin, checked from `profiles`                 | updating a profile and its Auth user, the soft delete and restore with the ban, and "delete for good" with the CV folder |
| `assess-cv`              | the card's owner or an admin, read with their JWT | inserting the assessment                                                                                                 |
| `delete-candidate`       | the candidate's owner or an admin                 | nothing: the JWT only                                                                                                    |
| `purge-deleted-accounts` | pg_cron, with a secret compared in constant time  | everything: listing due accounts, removing their CV folders, deleting their Auth users. The one exception to rule 2      |

Outside the Edge Functions, the service role key appears only in `scripts/seed-demo.ts` (from the shell or `.env.seed.local`, with `--yes` required). The end-to-end seed and fixtures use the local stack's fixed key and refuse any host but `127.0.0.1` and `localhost` (`scripts/local-stack.ts`). Never in `src/` (rule 1).

---

## 3. Guards and their proof

Layers: **structure** (how the data is shaped, so the mistake cannot be written), **schema** (constraints, keys, triggers, RLS, grants), **CI test** (fails when the guard is removed), **tool check** (a script or function refuses at run time), **permission** (who is allowed to run a step at all).

"Check" means `supabase/tests/rls_test.sql`, which CI runs on every PR. Function tests run in the CI `functions` job, end-to-end tests in the `e2e` job.

| Guard                                                                                | Layer                                                                                                                      | Proof                                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Customer B cannot read, change, create for or delete customer A's rows               | schema (RLS)                                                                                                               | checks 2, 3, 4, 14, 40; `e2e/isolation.spec.ts`                                           |
| An admin acts for a customer and the rows belong to that customer                    | schema (RLS, triggers)                                                                                                     | checks 8, 8b, 8c, 41; `e2e/admin.spec.ts`, `e2e/stages.spec.ts` (admin test)              |
| Signed-out users get nothing                                                         | schema (grants, RLS)                                                                                                       | checks 9, 9b, 20, 42, 50                                                                  |
| Only the privileges the app uses                                                     | schema (grants)                                                                                                            | checks 20, 22, 43                                                                         |
| A customer cannot make itself admin; the role comes from `profiles`                  | schema                                                                                                                     | checks 5, 24, 33                                                                          |
| A card's customer comes from its job, and job and candidate share a customer         | schema (trigger)                                                                                                           | checks 1, 6, 7b, 8b                                                                       |
| An assessment's customer comes from its card; clients never create or change one     | schema (trigger, grants)                                                                                                   | checks 11, 13, 21                                                                         |
| A CV path stays inside its customer's folder                                         | schema (`candidates_cv_path_own_folder`), Storage policies                                                                 | checks 10, 12, 31                                                                         |
| A CV upload is a PDF of at most 5 MB                                                 | schema (bucket limits)                                                                                                     | check 31                                                                                  |
| A job or column with cards is not deleted                                            | schema (`no action` keys)                                                                                                  | checks 15, 17, 38                                                                         |
| One Hired, at least one Rejected, at least one open column, at most 10, unique names | schema (triggers, constraints)                                                                                             | checks 37, 46, 47; `pipeline_stages_concurrency.sh` case 2                                |
| A card always has a column, and a new one lands in the first open column             | schema (not null, trigger)                                                                                                 | checks 35, 36, 45                                                                         |
| A card moves only into its own customer's columns                                    | schema (composite key)                                                                                                     | checks 39, 45; `move_application_concurrency.sh`; `pipeline_stages_concurrency.sh` case 3 |
| Concurrent column writes never deadlock                                              | schema (lock order)                                                                                                        | `pipeline_stages_concurrency.sh` cases 1, 4                                               |
| The last active admin is never deleted or demoted                                    | schema (advisory lock)                                                                                                     | checks 30, 33; `last_admin_concurrency.sh`; `admin-manage-account/handler.test.ts`        |
| A deleted account sees nothing and is purged only after 30 days                      | schema                                                                                                                     | checks 25, 26, 27, 28                                                                     |
| Deleting an account removes all its rows                                             | schema (cascades)                                                                                                          | checks 18, 19, 43                                                                         |
| Removing a CV removes its assessments                                                | schema (trigger)                                                                                                           | checks 32, 34                                                                             |
| A candidate's CV goes with them, file first                                          | tool check (Edge Function)                                                                                                 | `delete-candidate/handler.test.ts`; `e2e/candidate-delete.spec.ts`                        |
| An account's CV folder goes before its user                                          | tool check (Edge Functions)                                                                                                | `purge-deleted-accounts/handler.test.ts`; `admin-manage-account/handler.test.ts`          |
| The purge runs only with the cron secret                                             | tool check                                                                                                                 | `purge-deleted-accounts/handler.test.ts`                                                  |
| Every text has a length limit in the database                                        | schema (checks)                                                                                                            | check 23; `src/test/length-errors.test.ts`                                                |
| The end-to-end tests never touch the project                                         | tool check                                                                                                                 | `scripts/local-stack.ts` refuses other hosts                                              |
| Claude Code cannot run remote Supabase commands or read the CLI token                | permission (`.claude/settings.json`)                                                                                       | checked form by form in ATS-57 (PR #115); no automated test                               |
| The CLI version cannot jump to a new major version                                   | structure (exact `devDependencies` pin, CI pin)                                                                            | `package.json`, `.github/workflows/ci.yml`                                                |
| Public sign-up is off                                                                | schema (Auth config: the project's settings, `[auth] enable_signup = false` in `supabase/config.toml` for the local stack) | none yet: see § 7                                                                         |

---

## 4. Database and Storage without a shared transaction

Storage and Postgres cannot commit together, so each flow picks the order whose failure is easiest to recover from. The rule: never leave a file that no row points at, because nobody can see or delete it.

| Flow                                                | Order                                                                                                         | Worst case, and the way back                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete a candidate (`delete-candidate`, ATS-56)     | 1. remove the CV file. 2. delete the row (cascades the cards and assessments). 3. if 2 fails, clear `cv_path` | 1 fails: nothing changed. 2 fails: the candidate stays without a CV and can be deleted again. 2 and 3 both fail: the candidate keeps a `cv_path` to a removed file, so opening the CV fails until it is replaced or the candidate is deleted again. Accepted (epic 8 review, ATS-57 AC6) |
| Upload or replace a CV (`uploadCandidateCv`)        | 1. upload to the fixed path. 2. set `cv_path`                                                                 | 2 fails because the candidate is gone: the file just uploaded is removed again. 2 fails otherwise: the old path still names the same file, now with new content                                                                                                                          |
| Add a candidate with a CV (`save-candidate.ts`)     | 1. insert the candidate. 2. upload                                                                            | 2 fails: the candidate is saved without a CV, and the dialog says so (`cv_upload_failed`) and closes, so saving again does not make a duplicate                                                                                                                                          |
| Remove a CV (`removeCandidateCv`)                   | 1. remove the file. 2. clear `cv_path` (removes the assessments)                                              | 2 fails: a path to a missing file, cleared by the next try                                                                                                                                                                                                                               |
| Delete an account for good (`admin-manage-account`) | 1. remove the CV folder. 2. delete the Auth user (cascades everything)                                        | 1 fails: the account stays, to try again. 2 fails: the account stays without CVs                                                                                                                                                                                                         |
| Nightly purge (`purge-deleted-accounts`)            | per account: 1. remove the CV folder. 2. delete the Auth user                                                 | one account failing never stops the others; it stays and the next night tries again                                                                                                                                                                                                      |
| Assess a CV (`assess-cv`)                           | reads the CV, then checks that `cv_path` is unchanged before saving                                           | a CV replaced meanwhile gives `cv_changed`, and no assessment of the old file is saved                                                                                                                                                                                                   |

---

## 5. Decisions to keep

Choices made in earlier tickets that a later change could undo by accident. The skill checks a diff against each one it touches.

- **The candidate delete order (ATS-56).** File first, then the row, then clear `cv_path` if the row stays (§ 4). Clients may read and delete their own assessments; only `assess-cv` creates them (rule 8).
- **`reset_stages` is security definer (ATS-40)**, because a removed default column comes back with its `default_key`, and the column grants keep `default_key` from every client. It checks the caller with the table policy's rule itself, keeps the default columns' ids so their cards stay, and refuses with `23503`, changing nothing, while a column it would remove has cards (checks 48, 49).
- **A new card goes to the first open column, and every customer keeps one (ATS-40 AC7).** The trigger picks the first `open` column by position, whatever it is called; `stage_open_required` refuses removing the last open column or changing its kind (checks 45, 46).
- **The nil UUID default for `stage_id` (ATS-42).** `stage_id` is `not null` with the default `00000000-0000-0000-0000-000000000000`, which no column can have, so the generated Insert type keeps it optional and `applications_start_stage` replaces it. A column the client names must be one of the card's own customer's (the composite key, `23503`).
- **The CLI pin and the deny rules (ATS-57).** The Supabase CLI is an exact dev dependency, `2.122.0`, the same version as CI; both are bumped in one PR (ATS-59, #114). `.claude/settings.json` denies Claude Code every remote Supabase command and reading `~/.supabase/`; the developer runs remote commands.
- **The login swap safety (`docs/next-teams.md`, ATS-58).** The swap cannot run before the company tables exist; after step 1 no customer table and not `companies` references `profiles` or `auth.users`, which CI checks; the swap checks that rule again before it changes anything, is tested with stored CV files, defaults to a dry run, and runs only after a data dump of the project.
- **One id, four meanings, until epic 9.** The Auth user, the profile, the row owner and the CV folder share one id today. After ATS-44 a company keeps the first user's id, so the purge and "delete for good" must not remove a folder named after a deleted user who is not the company: `accounts_due_for_purge` skips a user whose id is a company id, and the functions are deployed before `db push` (`docs/next-teams.md`).

---

## 6. The human steps and their order

Some steps reach the project and cannot be checked by CI. They are run by the developer, in this order.

1. **Before the merge, the migration reaches the project.** The developer runs `npx supabase db push --dry-run`, which must list only the branch's migrations, then `npx supabase db push` after a yes. A migration must be backwards compatible with the code on `main`, which runs against it until the merge.
2. **The types are regenerated from the project** and compared by Claude; a diff is committed to the branch.
3. **`rls_test.sql` is run in the SQL Editor** against the project when the migration changes tables, policies or functions, and the PR says it passed.
4. **Edge Functions are deployed** before the merge when the code on `main` calls the new version, and after it otherwise. When a migration and a function change together, the order is decided in the PR (for ATS-44, functions first).
5. **A PR whose migration is applied but is closed without merging** gets a new migration that reverts it.
6. **Who runs what.** Claude never runs a command against the linked project, not even a read-only one; it prints the command, and `.claude/settings.json` refuses the remote ones. For the local stack, Claude runs only `start`, `stop` and `status`. The demo seed writes to a project only with `--yes`.
7. **The CLI version** is the one in `package.json`, `2.122.0`, the same as CI.

---

## 7. Known gaps

Found by a full run, each with where it is tracked. None lets a customer reach another customer's data.

| Gap                                                                                                                                                                                                                                                                          | Severity | Tracked in                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- |
| An admin can change `customer_id` on a job or a candidate. The rows move, but the job's cards keep the old customer, so a card can point at another customer's job. The app never sends `customer_id` on an update, and a candidate with a CV is refused by the folder check | 🟡       | `TICKETS.md` § Found while building (ATS-60) |
| The deny rules in `.claude/settings.json` have no automated test; they were checked by hand in ATS-57                                                                                                                                                                        | 🟢       | `TICKETS.md` § Found while building (ATS-60) |
| No test proves that public sign-up is off. An end-to-end test against the local stack could call `signUp` and expect a refusal; the project's own setting is checked by hand                                                                                                 | 🟢       | `TICKETS.md` § Found while building (ATS-60) |
