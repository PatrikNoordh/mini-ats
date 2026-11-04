# Next: teams

A design sketch for epic 9 (ATS-43). Nothing here is built yet. The decisions below were made with the developer before the sketch was written, and the work is split into tickets at the end.

## Today

A customer is one login: one row in `profiles` with `role = 'customer'`, and `customer_id` on every row of customer data is that user's id.

- **Database:** `jobs`, `candidates`, `applications`, `cv_assessments` and `pipeline_stages` reference `profiles (id)` with `on delete cascade`. Every customer policy is `customer_id = auth.uid() and account_is_active()`, or `is_admin()`. The `cvs` bucket keeps each customer's files in a folder named after that id, checked by the storage policies and by `candidates_cv_path_own_folder`.
- **App:** `ActiveCustomerContext` gives a customer their own profile id, and an admin the customer profile they picked. Every query key carries that id. The company name is `profiles.company_name`.
- **Accounts:** an admin creates a customer account with `admin-create-user`, which makes the login, the profile and, through a trigger, the six default columns. Deleting the account deletes the customer: after 30 days `purge-deleted-accounts` removes the CV folder and the Auth user, and the cascades remove every row.

## The feature

Several users per company instead of one shared login. They see and edit the same jobs, candidates, board and columns. A user in another company sees none of it, and an admin still acts for any company.

## Decisions

- **`customer_id` is a company id**, in a new `companies` table. A company outlives any one of its users. (AC1)
- **Each existing customer's company gets the customer's own id.** So no row of customer data, no CV folder, no query key and no stored admin choice changes when the table arrives; only what the id points at does.
- **The trap in reusing the ids:** a migrated company's id equals its first user's id, so an old `customer_id = auth.uid()` check still passes for that user. A policy, a storage rule or an Edge Function that was missed would look right in every test that signs in as that user. So every RLS, storage and Edge Function test also signs in as a second member of the same company, for whom only a membership check passes.
- **A user belongs to exactly one company.** A customer user never picks a company: their active customer is their company. Admins belong to none and act for any, as today. The membership table is shaped so that several companies per user can come later: dropping one constraint and adding a chooser, not a new table.
- **No roles inside a company.** All members are equal. Only admins add, move and remove users, on the accounts page, as only admins create accounts today (security rule 3). A company owner role can come later as its own epic.
- **The 30-day delete and the nightly purge move to companies.** Deleting a user removes one login; deleting a company removes its data, with the same 30 days to restore it.

## Design

### Database

1. **`companies`**: `id`, `name` (the company name, moved from `profiles.company_name`, with the length limit of a name), `created_at`, `deleted_at`. RLS: a member reads their own company; an admin reads and writes all. A client never deletes a row; the purge does.
2. **`company_members`**: `company_id` → `companies` (`on delete cascade`), `user_id` → `profiles` (`on delete cascade`), `created_at`. The primary key is `(company_id, user_id)`, the shape a user in several companies needs; `unique (user_id)` adds the one-company rule on top. Several companies per user later is dropping that constraint and adding a chooser, not a new table. Only admins and the service role write it. An admin account is never a member: a check trigger refuses a membership for a profile whose role is `admin`.
3. **`public.current_company_id()`**: security definer, stable. The signed-in user's company id when the user is active (`profiles.deleted_at is null`) and the company is too (`companies.deleted_at is null`), otherwise null. Every customer policy becomes
   `customer_id = (select public.current_company_id()) or (select public.is_admin())`,
   the same shape as today, still evaluated once per statement. `account_is_active()` stays for the profile policy.
   **The CV storage policies** (read, upload, replace, remove in `cvs`) compare the folder with `auth.uid()` today. They must check the company instead, `(storage.foldername(name))[1] = (select public.current_company_id())::text`, or a second member could not open, upload or remove the company's CVs. The first member still could, which is exactly the trap above.
4. **The foreign keys** on `customer_id` move from `profiles (id)` to `companies (id)`, still `on delete cascade`, so deleting a company removes its data as deleting a profile did.
5. **New companies get the six default columns** from a trigger on `companies` instead of on `profiles`. Admin profiles stop getting columns; the columns they have now are removed (no card can point at them, since no admin owns a job).
6. **The migration that brings companies (ATS-44)** must keep the code on `main` working until the app moves over:
   - It creates a company for every customer profile, with the profile's id and `company_name`, and a membership for the profile. It stops with a clear message, changing nothing, if a job, candidate, card or assessment belongs to a profile that is not a customer. The admins' own columns are not such data: they are removed, as step 5 says.
   - Until ATS-46, `handle_new_user` gives every new customer user a company with the user's own id, and their membership, so `admin-create-user` on `main` keeps working.
   - Until ATS-58, deleting a profile deletes the company with the same id, so deleting an account on `main` still deletes the customer, and the purge still works.
   - `profiles.company_name` stays until a later migration drops it, once no code on `main` reads it.

### Database functions and triggers (AC4)

Every database function that checks ownership itself instead of leaving it to RLS, and every trigger that depends on another one running first, and what each needs:

| Function or trigger                                                  | Today                                                                                                                          | With companies                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reset_stages` (security definer)                                    | Checks `customer_id = auth.uid() and account_is_active()` or `is_admin()` itself, and that the profile exists                  | Checks `customer_id = current_company_id()` or `is_admin()`, and that the company exists and is not deleted                                                                                                                                                      |
| `check_pipeline_stage_kinds` (constraint trigger)                    | Skips the kind rules when the profile is gone, so an account delete can cascade                                                | Skips them when the company is gone, so a company delete can cascade; a user delete no longer reaches the columns                                                                                                                                                |
| `handle_new_profile_stages` / `create_default_stages`                | Gives every new profile the six columns                                                                                        | Moves to a trigger on `companies`; profiles get none                                                                                                                                                                                                             |
| `set_application_customer` (security definer)                        | Sets `customer_id` from the job, refuses a job and candidate of different customers                                            | Unchanged: both are company ids                                                                                                                                                                                                                                  |
| `set_assessment_customer` (security definer)                         | Sets `customer_id` from the application                                                                                        | Unchanged                                                                                                                                                                                                                                                        |
| `set_application_start_stage` (security definer)                     | Runs after `applications_set_customer`, only because of the name order, and picks the first open column of the card's customer | Unchanged in what it does. The order becomes explicit: the triggers are renamed `applications_1_set_customer` and `applications_2_start_stage`, like `candidates_cv_uploaded_at_1_keep` and `_2_stamp`, and a check in `rls_test.sql` fails if the order changes |
| `pipeline_stages_before_write`                                       | Locks per `customer_id`                                                                                                        | Unchanged: the lock keys are company ids                                                                                                                                                                                                                         |
| `add_stage`, `reorder_stages`, `move_application` (security invoker) | RLS decides, narrowed by the `customer_id` argument                                                                            | Unchanged: the argument is the company id                                                                                                                                                                                                                        |
| `handle_new_user`                                                    | Creates the profile, with `company_name` from `user_metadata`                                                                  | Creates the profile only. From ATS-46, `admin-create-user` adds the membership (until then, see the bridge above)                                                                                                                                                |
| `soft_delete_or_demote_account`, `sync_role_from_app_metadata`       | Last-admin rule                                                                                                                | Unchanged. A demotion to customer now also needs a company, so `admin-manage-account` takes one (ATS-46); a promotion to admin removes the membership                                                                                                            |
| `accounts_due_for_purge`                                             | Profiles deleted more than 30 days ago                                                                                         | Unchanged for users; `companies_due_for_purge` is added (ATS-58)                                                                                                                                                                                                 |
| `applications.customer_id default auth.uid()`                        | A placeholder `applications_set_customer` always replaces                                                                      | Becomes the nil UUID, like `stage_id`: for a second member `auth.uid()` is not a company id at all, so the placeholder should not look like one                                                                                                                  |
| `candidates_cv_path_own_folder`                                      | The CV's folder is the customer id                                                                                             | Unchanged: the folder is the company id, and the same id for existing customers                                                                                                                                                                                  |

### Edge Functions

All of them keep reading with the caller's JWT. RLS answers by company instead of by user, so the functions that only read and write customer data need no change.

- **`assess-cv`, `delete-candidate`**: unchanged. They read the candidate's `customer_id` from the row, which is now the company id, and the CV path is built from it.
- **`admin-create-user`** (ATS-46): takes the company, an existing `company_id` or a new company's name. It creates the user and then the membership, with the service role, as the one privileged action, and deletes the new user again if the membership cannot be added. An admin account gets no company.
- **`admin-manage-account`** (ATS-46): deleting, restoring and deleting a user for good now touch only that user; the company and its data stay. Moving a user to another company and demoting an admin to a customer take a `company_id`.
- **`admin-manage-company`** (new, ATS-58): deletes a company (sets `deleted_at` and bans its users in Auth, like an account delete), restores it, and deletes it for good. It checks `is_admin()` with the caller's JWT first, like the account functions.
- **`purge-deleted-accounts`** (ATS-58): also purges companies deleted more than 30 days ago: their CV folder (named after the company id), their users, then the company row, which cascades to its data. Users deleted on their own are purged as today, without touching any data.

### The deleted-accounts flow

|                    | A user is deleted                                                                | A company is deleted                                            |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| What the user sees | Their login is banned; their token gets no rows (`current_company_id()` is null) | Every member's login is banned and gets no rows                 |
| The company's data | Stays, and the other members keep working                                        | Stays for 30 days, hidden from everyone but admins              |
| Restore            | Brings the user back into the company                                            | Brings the company and its members back                         |
| After 30 days      | The Auth user and the profile go; the membership goes with them                  | The CV folder, the users, then the company and everything in it |

The last-admin rule and its lock are unchanged; admins belong to no company.

### App

- **Types and data layer:** `Company` and `src/lib/api/companies.ts` (`listCompanies`, `getCompany`). The signed-in profile carries its `company_id`.
- **`ActiveCustomerContext`**: for a customer user, `customerId` is their company id, read from their membership; a user without an active company is signed out like a deleted account today. For an admin, the list to choose from is the active companies, not the customer profiles, and the stored choice is a company id, the same ids as today's.
- **Query keys** keep their shape and the active customer id, which is now a company id. Switching company must never show the previous one's data, as today.
- **Shell and chooser:** the company name comes from `companies.name`.
- **Accounts page** (ATS-46): companies and their users. An admin creates a company, creates users into it, moves a user to another company and removes a user. Deleting and restoring a company (ATS-58) work like deleting and restoring an account today, with the 30 days and the type-the-name confirm.
- **Seeds:** the demo and end-to-end seeds create a company, then its users. The end-to-end fixtures get a second user in the same company.

### Security rules that change

- **Rule 5** reads: customers see only rows where `customer_id` is their company's id, through `current_company_id()`.
- **Rule 3** gets: a user joins a company only through `admin-create-user` or `admin-manage-account`, which check that the caller is an admin.
- **Rule 7** is unchanged: the database sets `customer_id` on cards and assessments, and never trusts the client's.

## Tests

- **Every test signs in as a second member too.** Every RLS, storage and Edge Function test that signs in as a customer also runs as a second member of the same company, whose id is not the company's. Only then does a policy that still compares with `auth.uid()` fail.
- `rls_test.sql`: two users in one company see and change the same rows, and open, upload and remove the same CVs; a user in another company sees none of them; a deleted user and the members of a deleted company see nothing; a client cannot add itself to a company, move to another one or make itself a member as an admin; the application triggers run in the named order; deleting a user keeps the company's data, deleting a company removes it.
- Edge Functions: `assess-cv` and `delete-candidate` are called as the second member too, against a candidate the first member created.
- End to end: two users of one company see the same board; a user of another company does not.

## Tickets

These replace ATS-44–46 in `TICKETS.md` (AC3).

1. **ATS-44 · Companies and memberships in the database.** The two tables with RLS and grants, `current_company_id()`, the policies and storage policies on companies, the foreign keys moved to `companies`, the default columns on new companies, `reset_stages` and `check_pipeline_stage_kinds` by company, the renamed application triggers, and the bridges that keep `main` working. Backwards compatible.
2. **ATS-45 · Companies in the data layer and contexts.** `Company`, `src/lib/api/companies.ts`, the profile's company, `ActiveCustomerContext` and the chooser by company, the company name from `companies`, seeds and fixtures by company, and an end-to-end test with two users in one company.
3. **ATS-46 · Admins manage a company's users.** The accounts page by company; `admin-create-user` and `admin-manage-account` by company; the creation bridge removed; security rules 3 and 5 updated.
4. **ATS-58 · Delete and restore a company.** `admin-manage-company`, `companies_due_for_purge` and the purge by company; the deletion bridge removed; `profiles.company_name` dropped once nothing reads it.

## Estimate

4–5 days of focused work, in the four tickets above. ATS-44 is the riskiest: it changes every policy at once, so its RLS tests come first.
