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

Show it with `errorCode()`, which returns the code or `"unknown"`:

```ts
toast.error(t(`errors.${errorCode(err)}`));
```

To add a code: add it to `ERROR_CODES`, then add `errors.<code>` to both locale files.

## Edge Functions (from epic 1)

Return the code as JSON with a fitting status, never a message:

```ts
return Response.json({ error: "email_exists" }, { status: 409, headers: corsHeaders });
```

The function's wrapper in `src/lib/api/` reads `error` and throws `new AppError(code)` when the code is in `ERROR_CODES`. Unknown codes become `errors.unknown`.

## Database (from epic 1)

Triggers and checks raise the code as the exception message:

```sql
raise exception 'job_candidate_customer_mismatch';
```

The data layer maps the message to an `AppError` the same way. The two triggers in the first migration raise `job_candidate_customer_mismatch` and `application_not_found` (ATS-5, AC4b), and `supabase/tests/rls_test.sql` checks both codes.

## Codes

| Code                              | Where                         | Meaning                                                 |
| --------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `card_not_found`                  | applications                  | The card does not exist for this customer               |
| `job_not_found`                   | jobs                          | The job does not exist for this customer                |
| `candidate_not_found`             | candidates                    | The candidate does not exist for this customer          |
| `email_exists`                    | profiles, `admin-create-user` | An account with that email already exists               |
| `invalid_credentials`             | auth                          | Wrong email or password                                 |
| `too_many_attempts`               | auth                          | Too many sign-in attempts in a short time               |
| `profile_not_found`               | auth                          | The account has no `profiles` row                       |
| `job_candidate_customer_mismatch` | applications (trigger)        | The job and the candidate belong to different customers |
| `application_not_found`           | cv_assessments (trigger)      | The application the assessment points at does not exist |
| `unknown`                         | anywhere                      | Fallback for errors without a known code                |
