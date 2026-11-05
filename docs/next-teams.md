# Next: teams

A design sketch for epic 9 (ATS-43). Nothing here is built yet. The decisions below were made with the developer, and the work is split into tickets at the end.

## Today

A customer is one login: one row in `profiles` with `role = 'customer'`, and `customer_id` on every row of customer data is that user's id.

- **Database:** `jobs`, `candidates`, `applications`, `cv_assessments` and `pipeline_stages` reference `profiles (id)` with `on delete cascade`. Every customer policy is `customer_id = auth.uid() and account_is_active()`, or `is_admin()`. The `cvs` bucket keeps each customer's files in a folder named after that id, checked by the four storage policies (which compare the folder with `auth.uid()`) and by `candidates_cv_path_own_folder`.
- **App:** `ActiveCustomerContext` gives a customer their own profile id, and an admin the customer profile they picked. Every query key carries that id. The company name is `profiles.company_name`.
- **Accounts:** an admin creates a customer account with `admin-create-user`, which makes the login, the profile and, through a trigger, the six default columns. Every account gets columns, admins too. Deleting the account deletes the customer: after 30 days `purge-deleted-accounts` removes the CV folder named after the user's id and the Auth user, and the cascades remove every row. "Radera för gott" in `admin-manage-account` does the same at once.

## The feature

Several users per company instead of one shared login. They see and edit the same jobs, candidates, board and columns. No member of one company ever sees another company's data, and an admin still acts for any company.

## Decisions

- **`customer_id` is a company id**, in a new `companies` table. A company outlives any one of its users. (AC1)
- **Ids:** each existing company gets its customer's profile id. Every company created later gets a new id of its own. Ids never change. What an admin changes is a company's name and the membership rows: adding, removing or moving a user.
- **A user belongs to exactly one company.** A customer user never picks a company: their active customer is their company. The membership table is shaped so that several companies per user later only means dropping one constraint and adding a chooser, not a new table.
- **No roles inside a company.** All members are equal. Only admins add, move and remove users, as only admins create accounts today (security rule 3).
- **Admins belong to no company and get no stages.** They act for a company through `ActiveCustomerContext`, as today. Making an admin a customer means adding them to a company.
- **Two steps for existing customers.** Step 1, a backwards-compatible migration, keeps each customer's first user as a member under the same id. Step 2, the login swap, replaces those logins with new accounts once the new code is live. After it, no user id equals a company id.
- **The 30-day delete and the nightly purge move to companies.** Deleting a user removes one login and its membership. Deleting a company removes its data, CV files included, after 30 days.
- **A company whose last member is removed stays**, with all its data. The members page marks it as having no users; an admin adds a user to it or deletes it. It is never deleted on its own.
- **No bridge for new accounts.** Between ATS-44 and ATS-46, `admin-create-user` on `main` makes an account with no membership, which sees nothing. No customer accounts are created in that window. The members page in ATS-46 lists users without a company, so an account created anyway can be placed.
- **`profiles.company_name` stays for now**, as `applications.stage` did until ATS-42. The code on `main` reads it in the header and on the accounts page, and `handle_new_user` writes it. ATS-44 copies it to `companies.name`, and a trigger keeps `companies.name` in step while `main` still edits the profile. A later ticket drops it once no code reads it.

## Step 1: the migration (ATS-44)

Backwards compatible: the code on `main` keeps working until the app moves over in ATS-45, because every existing customer's first user is a member of a company with their own id.

### Tables

1. **`companies`**: `id`, `name` (copied from `profiles.company_name`, with a name's length limit), `created_at`, `deleted_at`. No foreign key to `profiles` or `auth.users`, even where the ids match. RLS: a member reads their own company; an admin reads all and writes the name. A client never deletes a row.
2. **`company_members`**: `company_id` → `companies` (`on delete cascade`), `user_id` → `profiles` (`on delete cascade`), `created_at`. Primary key `(company_id, user_id)`, plus `unique (user_id)` for the one-company rule. Only admins and the service role write it, and a check trigger refuses a membership for a profile whose role is `admin`. Deleting a user removes their membership and nothing else.
3. **The migration fills them**, in this order:
   1. **The check runs first:** it stops with a clear message, changing nothing, if a job, candidate, card or assessment belongs to a profile that is not a customer.
   2. A company for every customer profile, with the profile's id, its `company_name` as the name, and its `deleted_at`. A soft-deleted customer's company is deleted with it, so the company is purged with its data in ATS-46 instead of outliving its purged login.
   3. A membership for that profile.
   4. A trigger on `profiles` keeps `companies.name` in step when `main` edits `company_name`, until the column is dropped.

### What moves to companies

4. **Every `customer_id` foreign key** on `jobs`, `candidates`, `applications`, `cv_assessments` and `pipeline_stages` moves from `profiles (id)` to `companies (id)`, still `on delete cascade`. After this, no customer table references `profiles` or `auth.users`, so deleting a user can never cascade to company data.
5. **RLS** uses membership. A new function `public.current_company_id()` (security definer, stable) returns the signed-in user's company id while the user is active (`profiles.deleted_at is null`) and the company is too (`companies.deleted_at is null`), otherwise null. Every customer policy becomes `customer_id = (select public.current_company_id()) or (select public.is_admin())`, the same shape as today, evaluated once per statement. `account_is_active()` stays for the profile policy.
6. **The CV storage policies** (read, upload, replace and remove in `cvs`) compare the folder with `current_company_id()` instead of `auth.uid()`: `(storage.foldername(name))[1] = (select public.current_company_id())::text`. Otherwise a second member could not open, upload or remove the company's CVs.
7. **Default stages per company, not per user.** The six defaults come from a trigger on `companies`; a new user gets no stages of their own, and the admins' columns are removed (no card can point at them). `check_pipeline_stage_kinds` is replaced first, so that it skips the kind rules for an id that is not a company: today it only skips them when the profile is gone, and would refuse removing an admin's last Hired column.
8. **Removing a CV folder by user id stops.** `purge-deleted-accounts` and "Radera för gott" in `admin-manage-account` remove the folder named after the deleted user's id today. For a migrated company's first user that folder is the company's. Two guards, so the order of the deploys never matters:
   - In the migration, `accounts_due_for_purge` skips every user whose id is a company id. Even the purge deployed from `main` can then never remove a company's CV folder.
   - The changed `purge-deleted-accounts` and `admin-manage-account`, which never remove a folder for a user, are deployed before `db push`. If the PR is closed without merging, they are deployed again from `main`.

   From then on only a company's delete removes its folder (ATS-46).

9. **The seeds create a company first.** Without a bridge a new user has no company, so ATS-44 moves the end-to-end and demo seeds to create a company and then its users, and CI stays green. Until ATS-45 moves the app to companies, `main` reads a customer's data by their own profile id, so in ATS-44 the seeds give the company the user's own id, the same shape as a migrated customer. ATS-45 switches them to a new id for every company.

### Database functions and triggers (AC4)

Every database function that checks ownership itself instead of leaving it to RLS, and every trigger that depends on another one running first, and what each needs:

| Function or trigger                                                  | Today                                                                                                                          | With companies                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reset_stages` (security definer)                                    | Checks `customer_id = auth.uid() and account_is_active()` or `is_admin()` itself, and that the profile exists                  | Checks `customer_id = current_company_id()` or `is_admin()`, and that the company exists and is not deleted                                                                                                                                                      |
| `check_pipeline_stage_kinds` (constraint trigger)                    | Skips the kind rules when the profile is gone, so an account delete can cascade                                                | Skips them when there is no company with that id, so a company delete can cascade and the admins' columns can be removed; replaced before those columns are deleted                                                                                              |
| `handle_new_profile_stages` / `create_default_stages`                | Gives every new profile the six columns                                                                                        | Moves to a trigger on `companies`; profiles get none                                                                                                                                                                                                             |
| `set_application_customer` (security definer)                        | Sets `customer_id` from the job, refuses a job and candidate of different customers                                            | Unchanged: both are company ids                                                                                                                                                                                                                                  |
| `set_assessment_customer` (security definer)                         | Sets `customer_id` from the application                                                                                        | Unchanged                                                                                                                                                                                                                                                        |
| `set_application_start_stage` (security definer)                     | Runs after `applications_set_customer`, only because of the name order, and picks the first open column of the card's customer | Unchanged in what it does. The order becomes explicit: the triggers are renamed `applications_1_set_customer` and `applications_2_start_stage`, like `candidates_cv_uploaded_at_1_keep` and `_2_stamp`, and a check in `rls_test.sql` fails if the order changes |
| `pipeline_stages_before_write`                                       | Locks per `customer_id`                                                                                                        | Unchanged: the lock keys are company ids                                                                                                                                                                                                                         |
| `add_stage`, `reorder_stages`, `move_application` (security invoker) | RLS decides, narrowed by the `customer_id` argument                                                                            | Unchanged: the argument is the company id                                                                                                                                                                                                                        |
| `handle_new_user`                                                    | Creates the profile, with `company_name` from `user_metadata`                                                                  | Unchanged until `company_name` is dropped: it creates no company or membership. A user joins a company through `admin-create-user` (ATS-46)                                                                                                                      |
| `soft_delete_or_demote_account`, `sync_role_from_app_metadata`       | Last-admin rule                                                                                                                | Unchanged. Demoting an admin means adding them to a company (ATS-46); promoting a customer removes the membership                                                                                                                                                |
| `accounts_due_for_purge`                                             | Profiles deleted more than 30 days ago                                                                                         | Skips every user whose id is a company id (ATS-44); `companies_due_for_purge` is added (ATS-46)                                                                                                                                                                  |
| `applications.customer_id default auth.uid()`                        | A placeholder `applications_set_customer` always replaces                                                                      | Becomes the nil UUID, like `stage_id`: for anyone but a migrated first user `auth.uid()` is not a company id                                                                                                                                                     |
| `candidates_cv_path_own_folder`                                      | The CV's folder is the customer id                                                                                             | Unchanged: the folder is the company id, the same id for existing customers                                                                                                                                                                                      |

### Edge Functions

All of them keep reading with the caller's JWT, and RLS answers by company instead of by user.

- **`assess-cv`, `delete-candidate`**: unchanged. They read the candidate's `customer_id`, now the company id, from the row, and build the CV path from it.
- **`purge-deleted-accounts`, `admin-manage-account`**: stop removing a CV folder for a user (step 1, point 8).
- The rest is ATS-46: `admin-create-user` and `admin-manage-account` by company, a new `admin-manage-company`, and the purge by company.

## Step 2: the login swap (ATS-58)

Once the new code is live, each existing customer's old login is replaced by a new account with a new id and the same email, as a member of the company. After the swap no user id equals a company id, so an old `customer_id = auth.uid()` check fails for everyone, and a missed policy shows up at once.

- **How it runs:** `scripts/swap-logins.ts`, run once by the developer from their own terminal with the project's service role key. Security rule 1 names it next to the seed scripts. Claude never runs it; it prints the command for the developer.
- **A dry run is the default.** Without `--yes` it lists the logins it would replace and changes nothing.
- **Each company is swapped on its own,** in these steps:
  1. The old login's email is freed, so the new account can take it.
  2. A new account is created with the same email, as a member of the company, with a temporary password set by the admin and handed over, as when an account is created today.
  3. The old login is deleted. By then it owns no data: its membership goes, the company and everything in it stay.
- **It can be run again.** A rerun finishes a half-done swap, or puts the old email back if the new account could not be created, so no one is ever left without a login.
- **The demo accounts:** the demo seed does the same swap for them, and they keep their current demo passwords, set by the seed.

## Login swap safety

- **It cannot run too early.** The swap writes to `companies` and `company_members`, which only exist after step 1, so run before it, it fails before it deletes anything.
- **Deleting a user never reaches company data.** After step 1 no customer table references `profiles` or `auth.users`, and `companies` has no foreign key to either, even though the ids match.
- **CI checks that rule.** `rls_test.sql` checks that no customer table, and not `companies`, has a foreign key to `profiles` or `auth.users`, and that deleting a company's first user leaves all its jobs, candidates, cards and `cv_path` values.
- **The swap checks it again first.** Before it changes anything, it checks the same rule in the database and refuses with an error code if it does not hold.
- **It is tested with stored files.** On the local stack, the swap runs for a first user who has uploaded CVs, so deleting the old login is shown to work when it owns storage objects.
- **A dry run is the default**, listing the logins it would replace; only `--yes` changes anything.
- **It runs only after a data dump** of the project, saved outside the repo.

## The deleted-accounts flow

|                    | A user is deleted                                              | A company is deleted                                                  |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Sign-in            | That login is banned; its token gets no rows                   | Every member's login is banned, and their tokens get no rows          |
| The company's data | Stays, and the other members keep working                      | Stays for 30 days, hidden from everyone but admins                    |
| Restore            | Brings the user back into the company                          | Brings the company and its members back                               |
| After 30 days      | The Auth user and the profile go, and the membership with them | The CV folder, the members' logins, then the company and all its data |

The last-admin rule and its lock are unchanged; admins belong to no company.

## App

- **Types and data layer (ATS-45):** `Company` and `src/lib/api/companies.ts`. The signed-in profile carries its `company_id`.
- **`ActiveCustomerContext` (ATS-45):** for a customer user, `customerId` is their company id, read from their membership; a user without an active company is signed out, like a deleted account today. An admin chooses among the active companies, and a stored choice from before still works, since the ids are the same.
- **Query keys** keep their shape and the active customer id, now a company id. Switching company must never show the previous one's data, as today.
- **Shell and chooser:** the company name comes from `companies.name` (ATS-45).
- **Members page for admins (ATS-46):** companies and their users, and the users who have no company yet, so they can be placed. An admin creates a company, renames it, adds a user to it, moves a user to another company, removes a user, and deletes or restores a company, with the 30 days and the type-the-name confirm of today's account delete.
- **Seeds:** the demo and end-to-end seeds create a company, then its users: with the user's own id in ATS-44, with a new id from ATS-45. The end-to-end fixtures can add a second user to a company (ATS-45).

## Security rules that change

- **Rule 5:** customers see only rows where `customer_id` is their company's id, through `current_company_id()`. A customer table never references `profiles` or `auth.users`.
- **Rule 1** names `scripts/swap-logins.ts` next to the seed scripts: it reads the service role key from the developer's shell, runs only on their machine and never in CI.
- **Rule 3:** a user joins, moves between or leaves a company only through the admin Edge Functions, which check that the caller is an admin.
- **Rule 7** is unchanged: the database sets `customer_id` on cards and assessments, and never trusts the client's.

## Tests

- **Every RLS, storage and Edge Function test also signs in as a second member of the same company**, both before and after the swap. Before the swap the first member's id is the company's, so only the second member shows a check that still compares with `auth.uid()`.
- **No member of company B ever sees company A's data**: rows, CVs, columns or the company itself.
- `rls_test.sql` also covers: two members share rows and CVs; a deleted member and the members of a deleted company see nothing; a client cannot join, leave or switch a company, or make an admin a member; the application triggers run in the named order; no customer table and not `companies` references `profiles` or `auth.users`; deleting a company's first user keeps its data.
- **Edge Functions:** the Deno tests use fakes, so the second member is tested against the real stack: an end-to-end test calls `delete-candidate` and opens and uploads a CV as the second member, on a candidate the first member created.
- End to end: two users in the same company see the same board, and a user in another company sees none of it.

## Tickets

These replace ATS-44–46 in `TICKETS.md` (AC3), in this order:

1. **ATS-44 · Companies and memberships in the database (step 1).**
2. **ATS-45 · Companies in the data layer and contexts.**
3. **ATS-46 · The members page for admins**, with deleting and restoring a company and the purge by company.
4. **ATS-58 · The login swap (step 2)**, with the demo seed.

Each rule above is an acceptance criterion of the ticket that builds it.

## Estimate

5–6 days of focused work, in the four tickets above. ATS-44 is the riskiest: it changes every policy at once, so its RLS tests come first.
