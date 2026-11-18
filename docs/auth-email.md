# Auth email

How Supabase Auth's emails (invites in ATS-50, password resets in ATS-51 and the rest) are prepared, where they work today, and how to switch them on in production. Set up in ATS-49.

## Where email works

| Where              | How Auth sends                                                                                                                            | Invites and password reset |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Local stack and CI | To **Mailpit**, the local stack's own inbox (`MAILPIT_URL` in `npx supabase status`, http://127.0.0.1:54324). No email leaves the machine | On, and tested end to end  |
| Production         | Supabase's **built-in email**, which only reaches the project's team members and sends a few emails an hour                               | **Off.** Not live          |

Email is prepared and proven on the local stack, but not switched on in production. Mini-ATS is a portfolio project, and setting up and running a provider is not worth it for it. Admins keep creating accounts with a password, as before.

So that production never offers a flow whose email cannot arrive, the invite and **Forgot password?** flows only show when `VITE_EMAIL_ENABLED` is `true`. The flag comes with ATS-50 and ATS-51: `false` by default and in production, `true` on the local stack and in CI. The epic 11 checkpoint runs on the local stack.

## The provider, when it is switched on

The documented choice is **Brevo**, as custom SMTP in Supabase Auth, from a separate free sender address made only for the app, never anyone's personal one.

- **Why Brevo:** one sender address can be verified by email, with no domain, and the free plan allows 300 emails a day.
- **The cost: emails may land in spam.** A sender on a free-mail domain has no SPF, DKIM or DMARC records of its own, so receiving servers trust it less. A real deployment verifies a domain it owns with the provider (SPF, DKIM and DMARC records in its DNS) and sends from an address on it.
- **Switching changes only settings.** The provider is the SMTP settings in the dashboard and the flag in Vercel. Changing provider, or moving to a verified domain, changes nothing in the code, the templates or the migrations.

## What lives where

| What                                                       | Where                                                                              | Committed                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| SMTP host, port, username and key, sender address and name | The project's dashboard: **Authentication → Emails → SMTP Settings** (empty today) | Never                                             |
| The templates                                              | `supabase/templates/`, one file per email                                          | Yes, they are the source                          |
| The subjects                                               | `supabase/config.toml`, `[auth.email.template.<type>]`                             | Yes                                               |
| Redirect URLs, secure email change, email rate limit       | The project's dashboard, as below                                                  | Only the local stack's, in `supabase/config.toml` |

`supabase/config.toml` has no `[auth.email.smtp]` section, and `src/test/auth-email-templates.test.ts` fails if one is added.

## The templates

Every email Auth can send has its own template, so no Supabase default (English only) goes out, including for flows the app does not offer: the Auth API sends a magic link or an email change on request whatever the app's UI shows.

| Template (`supabase/templates/`) | Dashboard name       | Sent when                                                                                |
| -------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `invite.html`                    | Invite user          | An admin invites an account (ATS-50)                                                     |
| `recovery.html`                  | Reset password       | Someone asks to reset a password (ATS-51)                                                |
| `magic_link.html`                | Magic link           | Someone asks for a sign-in link                                                          |
| `email_change.html`              | Change email address | Someone changes their address; with secure email change, to both the old and the new one |
| `reauthentication.html`          | Reauthentication     | A user asks for a code to confirm a sensitive change                                     |
| `confirmation.html`              | Confirm sign up      | Never while sign-up is off; there so no default goes out if that changes                 |

Auth does not know which language a user picked: the app keeps it in the browser. So each email has Swedish first and then English, with `lang` set on each part for screen readers. Email clients do not read the app's theme, so the templates write out its colour tokens as hex: `--primary`, `--foreground`, `--muted-foreground` and `--border` from `src/styles.css`.

On the local stack, `e2e/auth-email.spec.ts` sends an invite and a reset, reads each from Mailpit, checks the subject and both languages, and follows the link to check that it signs the user in through the app's own URL. CI runs it with the other end-to-end tests.

### Why they are pasted, not pushed

`npx supabase config push` can send the templates to the project, but it sends the whole of `supabase/config.toml`, which describes the local stack: its site URL is `http://127.0.0.1:4173`, its redirect URLs are local and its email rate limit is set for the tests. Pushing it would overwrite the project's Auth settings with local ones. So when email is switched on, the templates are pasted into the dashboard.

## Project settings that apply now

These matter even with email off: the built-in email still sends to the team, and any Auth link carries sign-in tokens.

1. **Supabase → Authentication → URL Configuration:** Site URL `https://mini-ats-pi-eosin.vercel.app`, and the redirect URLs allow **only** `https://mini-ats-pi-eosin.vercel.app/**`. Never a wildcard such as `https://*.vercel.app/**`: anyone can ask Auth for a reset email to someone else's address with a redirect URL of their choosing, and the link would carry that user's tokens to it. A preview pattern is left out too, since a project on another Vercel account could get a matching name.
2. **Supabase → Authentication → Sign In / Providers → Email:** **Secure email change** on, so both the old and the new address must confirm a change.

## Switching email on in production

Nothing in the code changes. In order:

1. **A sender address:** create a free address only for the app. Create a Brevo account with it, and under **Senders, Domains & Dedicated IPs → Senders** add the address and confirm it from its inbox. Under **SMTP & API → SMTP**, generate an SMTP key and note the SMTP login.
2. **The SMTP settings:** Supabase → **Authentication → Emails → SMTP Settings**, custom SMTP on. Sender email: the address. Sender name: `Mini-ATS`. Host `smtp-relay.brevo.com`, port `587`. Username: the SMTP login. Password: the SMTP key. Then **Authentication → Rate Limits**: the limit for sending emails at most what the plan allows; 30 an hour is enough.
3. **The templates:** Supabase → **Authentication → Emails → Templates**. For each template in the table above, set the subject to its `subject` in `supabase/config.toml` and paste the whole file as the body. The `{{/* … */}}` comment at the top renders as nothing.
4. **The flag:** set `VITE_EMAIL_ENABLED=true` for Production in Vercel and redeploy, so the invite and **Forgot password?** flows show.
5. **Check it:** Supabase → **Authentication → Users**, on a test account whose inbox you can read, **Send password recovery**. The email arrives from the sender with the subject `Återställ ditt lösenord · Reset your password` (Swedish first, English below; look in spam too), and its button opens the live app signed in.

Security notifications (password changed, email changed and the like) stay off. Turning one on needs a Swedish and English template first.
