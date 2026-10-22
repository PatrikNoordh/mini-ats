# Error codes

Errors never carry user-facing text across a boundary. Whatever fails — the data layer, an Edge Function or the database — returns a **code**, and the UI turns the code into text with `t()`. That keeps every message in `src/locales/sv.json` and `src/locales/en.json`, in both languages.

## The rule

- A code is `snake_case` English and names what happened, not what to show: `email_exists`, not `email_exists_message`.
- Every code has a key `errors.<code>` in both locale files. `src/test/i18n.test.ts` checks this for every code in `ERROR_CODES`.
- Anything without a known code shows `errors.unknown`. Unexpected errors (network, bugs) are never shown raw.

## In the app (`src/lib/api/`)

Throw an `AppError` with a code from `src/lib/errors.ts`:

```ts
import { AppError } from "@/lib/errors";

if (!job) throw new AppError("job_not_found");
```

Show it with `errorCode()`, which returns the code or `"unknown"`. A request that got no answer from the server is `offline` when the browser has no connection and `network_error` when it has one; `errorCode()` recognises each Supabase client's way of reporting it.

An error toast says what failed and why. `useErrorToast()` in `src/hooks/useErrorToast.ts` takes the action as the title and puts the code's text below it:

```ts
const errorToast = useErrorToast();
errorToast(t("jobDialog.saveFailed"), err); // "Kunde inte spara jobbet." + "Ingen internetanslutning…"
```

A code whose text already says it all, such as `links_failed`, can be shown on its own with `toast.error(t(`errors.${code}`))`.

To add a code: add it to `ERROR_CODES`, then add `errors.<code>` to both locale files.

## Edge Functions (from epic 1)

Return the code as JSON with a fitting status, never a message. `json()` in `supabase/functions/_shared/cors.ts` adds the CORS headers:

```ts
return json({ error: "email_exists" }, 409);
```

The app calls functions through `invokeFunction()` in `src/lib/api/functions.ts`. It reads `error` from the body and throws `new AppError(code)` when the code is in `ERROR_CODES`. Any 401 becomes `not_authenticated`, because the Supabase gateway answers a missing or invalid JWT itself, with a body of its own. Unknown codes become `errors.unknown`.

## Database (from epic 1)

Triggers and checks raise the code as the exception message:

```sql
raise exception 'job_candidate_customer_mismatch';
```

The data layer maps the message to an `AppError` with `fromDbError()` in `src/lib/errors.ts`. The two triggers in the first migration raise `job_candidate_customer_mismatch` and `application_not_found` (ATS-5, AC4b), and the `move_application` function raises `card_not_found` (ATS-12). The foreign key on `applications.job_id` refuses to delete a job with candidates; `deleteJob()` turns that error (`23503`) into `job_has_candidates` (ATS-26). `supabase/tests/rls_test.sql` checks all three codes.

## Codes

| Code                              | Where                                       | Meaning                                                    |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `card_not_found`                  | `move_application` (function)               | The card does not exist for this customer                  |
| `job_not_found`                   | jobs                                        | The job does not exist for this customer                   |
| `candidate_not_found`             | candidates                                  | The candidate does not exist for this customer             |
| `email_exists`                    | `admin-create-user`, `admin-manage-account` | An account with that email already exists                  |
| `invalid_input`                   | `admin-create-user`, `admin-manage-account` | The request body failed validation (`fields` names which)  |
| `not_authenticated`               | Edge Functions                              | No valid JWT: signed out or the session expired            |
| `forbidden`                       | `admin-create-user`, `admin-manage-account` | The caller is signed in but not an admin                   |
| `invalid_credentials`             | auth                                        | Wrong email or password                                    |
| `too_many_attempts`               | auth                                        | Too many sign-in attempts in a short time                  |
| `profile_not_found`               | auth                                        | The account has no `profiles` row                          |
| `job_candidate_customer_mismatch` | applications (trigger)                      | The job and the candidate belong to different customers    |
| `application_not_found`           | cv_assessments (trigger)                    | The application the assessment points at does not exist    |
| `links_failed`                    | candidates                                  | The candidate was saved, but linking it to jobs failed     |
| `unlinks_failed`                  | candidates                                  | The candidate was saved, but unlinking it from jobs failed |
| `already_linked`                  | applications                                | The candidate is already linked to that job                |
| `job_has_candidates`              | jobs                                        | The job still has candidates, so it cannot be deleted      |
| `text_too_long`                   | jobs, candidates (checks)                   | A text is over its length limit in the database            |
| `account_not_found`               | `admin-manage-account`                      | The account does not exist                                 |
| `account_deleted`                 | `admin-manage-account`, auth                | The account is deleted (also a deleted account signing in) |
| `account_not_deleted`             | `admin-manage-account`                      | Restore or delete for good on an account not deleted       |
| `cannot_change_self`              | `admin-manage-account`                      | An admin tried to delete or demote its own account         |
| `last_admin`                      | `admin-manage-account`                      | The change would leave no active admin                     |
| `offline`                         | any request (browser)                       | No answer, and the browser has no internet connection      |
| `network_error`                   | any request (browser)                       | No answer from the server, although the browser is online  |
| `unknown`                         | anywhere                                    | Fallback for errors without a known code                   |
