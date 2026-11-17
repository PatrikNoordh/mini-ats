# Auth email

How Supabase Auth sends its emails: invites (ATS-50), password resets (ATS-51) and the rest. Set up in ATS-49.

## The provider

Supabase's built-in email is only for testing: it sends to the project's team members and a few emails an hour. The project sends through **Brevo** instead, as custom SMTP in Supabase Auth.

- **From a free address without its own domain.** Brevo lets one sender address be verified by email, with no domain. The project uses a free address made only for the app, not anyone's personal one. No domain was bought for a portfolio project.
- **The cost: emails may land in spam.** A sender on a free-mail domain has no SPF, DKIM or DMARC records of its own, so receiving servers trust it less. A real deployment verifies a domain it owns with the provider (SPF, DKIM and DMARC records in its DNS) and sends from an address on it.
- **Switching changes only settings.** The provider is the SMTP settings in the dashboard. Moving to another provider, or to a verified domain, changes those settings and nothing in the code, the templates or the migrations.
- **Free plan limit:** 300 emails a day.

## What lives where

| What                                                 | Where                                                                | Committed                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| SMTP host, port, username and key                    | The project's dashboard: **Authentication → Emails → SMTP Settings** | Never                                             |
| Sender address and sender name                       | The same page                                                        | Never                                             |
| The templates                                        | `supabase/templates/`, one file per email                            | Yes, they are the source                          |
| The subjects                                         | `supabase/config.toml`, `[auth.email.template.<type>]`               | Yes                                               |
| Redirect URLs, secure email change, email rate limit | The project's dashboard, as below                                    | Only the local stack's, in `supabase/config.toml` |

`supabase/config.toml` has no `[auth.email.smtp]` section, and `src/test/auth-email-templates.test.ts` fails if one is added. Locally Auth sends to **Mailpit**, the local stack's own inbox (`MAILPIT_URL` in `npx supabase status`, http://127.0.0.1:54324), so no local email ever leaves the machine.

## The templates

Every email Auth can send has its own template, so no Supabase default (English only) ever goes out, including for flows the app does not offer yet: the Auth API sends a magic link or an email change on request whatever the app's UI shows.

| Template (`supabase/templates/`) | Dashboard name       | Sent when                                                                                |
| -------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `invite.html`                    | Invite user          | An admin invites an account (ATS-50)                                                     |
| `recovery.html`                  | Reset password       | Someone asks to reset a password (ATS-51)                                                |
| `magic_link.html`                | Magic link           | Someone asks for a sign-in link                                                          |
| `email_change.html`              | Change email address | Someone changes their address; with secure email change, to both the old and the new one |
| `reauthentication.html`          | Reauthentication     | A user asks for a code to confirm a sensitive change                                     |
| `confirmation.html`              | Confirm sign up      | Never while sign-up is off; there so no default goes out if that changes                 |

Auth does not know which language a user picked: the app keeps it in the browser. So each email has Swedish first and then English, with `lang` set on each part for screen readers. Email clients do not read the app's theme, so the templates write out its colour tokens as hex: `--primary`, `--foreground`, `--muted-foreground` and `--border` from `src/styles.css`.

### Why they are pasted, not pushed

`npx supabase config push` can send the templates to the project, but it sends the whole of `supabase/config.toml`, which describes the local stack: its site URL is `http://127.0.0.1:4173`, its redirect URLs are local and its email rate limit is set for the tests. Pushing it would overwrite the project's Auth settings with local ones. So the templates are pasted into the dashboard, and the PR that changes one says it was done.

## Setting up the project

The developer does this in Brevo and the Supabase dashboard. Nothing is committed.

1. **Brevo:** create an account with the app's own address. Under **Senders, Domains & Dedicated IPs → Senders**, add that address and confirm it from its inbox. Under **SMTP & API → SMTP**, generate an SMTP key and note the SMTP login shown there.
2. **Supabase → Authentication → Emails → SMTP Settings:** turn on custom SMTP.
   - Sender email: the verified address. Sender name: `Mini-ATS`.
   - Host `smtp-relay.brevo.com`, port `587`.
   - Username: the SMTP login from Brevo. Password: the SMTP key.
3. **Supabase → Authentication → Emails → Templates:** for each template in the table above, set the subject to the `subject` in `supabase/config.toml` and paste the whole file as the body. The `{{/* … */}}` comment at the top renders as nothing.
4. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://mini-ats-pi-eosin.vercel.app`
   - Redirect URLs, exactly these two:
     - `https://mini-ats-pi-eosin.vercel.app/**`
     - `https://mini-ats-*-patnoos-projects.vercel.app/**` (this project's previews: `mini-ats-git-<branch>-patnoos-projects` and `mini-ats-<hash>-patnoos-projects`)
   - Never `https://*.vercel.app/**`. The links in these emails carry sign-in tokens to the redirect URL, and anyone can ask Auth for a reset email to someone else's address with a redirect URL of their choosing. A wildcard over all of `vercel.app` would let any Vercel site receive a user's tokens. In Supabase's patterns `*` does not cross a `.`, so the preview pattern cannot reach another domain.
5. **Supabase → Authentication → Sign In / Providers → Email:** **Secure email change** on, so both the old and the new address must confirm. **Secure password change** stays as it is; the reauthentication template is ready either way.
6. **Supabase → Authentication → Rate Limits:** the limit for sending emails, at most what Brevo's free plan allows (300 a day). 30 an hour is enough for this project.
7. **Security notifications** (password changed, email changed and the like) stay off. Turning one on needs a Swedish and English template first.

## Checking it on the project

1. **Supabase → Authentication → Users**, on a test account whose inbox you can read: **Send password recovery**.
2. The email arrives from the Brevo sender, with the subject `Återställ ditt lösenord · Reset your password`, Swedish first and English below. Look in spam too, and note whether it landed there.
3. The button opens `https://mini-ats-pi-eosin.vercel.app` and signs the test account in.

On the local stack, `e2e/auth-email.spec.ts` sends an invite and a reset, reads each from Mailpit and follows the link.
