# Next: a customer's own theme

A design sketch for epic 12. Nothing here is built yet.

## The idea

A customer can choose to make Mini-ATS feel like their own app: their accent colour, their logo in the sidebar and, if they want, a background image behind the content. It is optional. A customer who never opens the settings sees Mini-ATS as today.

The risk is a messy or unreadable app. Every rule below exists to keep the text readable and the app recognisable as one product, whatever a customer picks.

## Today

- **Colours:** every colour is a token on `:root` in `src/styles.css`. The accent is `--primary`, with `--ring` and `--sidebar-primary` set to the same value, and `--primary-foreground` for text on it.
- **Logo:** `src/components/layout/Logo.tsx` draws the Mini-ATS mark in the sidebar. `CompanyName` shows the customer's company name in the header.
- **Files:** CVs live in the private `cvs` bucket, in a folder per customer, with server-side limits on size and type (`20261023180000_cv_bucket_limits.sql`).

## Decisions

- **Optional and per customer.** A customer, or an admin acting for them, edits the theme. Nothing changes for customers without one.
- **Readability wins over the brand.** The accent colour must pass a WCAG contrast check, so a colour that fails is refused with a hint. Cards, tables, dialogs and panels keep solid backgrounds, so text never sits on the image.
- **An admin always knows where they are.** An admin acting for a customer sees the customer's theme, but the acting banner keeps the Mini-ATS colours.
- **The sign-in page stays Mini-ATS.** The app doesn't know the customer until sign-in. A subdomain per customer is out of scope.
- **No real brands in the repo.** The demo seed uses a made-up brand. Real companies' logos and images never go in the public repo.

## Design

### Database (ATS-52)

1. **A `customer_branding` table**, one row per customer:
   - `customer_id` is the primary key and references `profiles`.
   - `accent_colour` is a hex colour, with a format check.
   - `logo_path` and `background_path` are nullable paths in the `branding` bucket.
   - `background_dim` is one of `light`, `medium` or `strong`.
   - `updated_at`.

   RLS and explicit grants work like the other tables: a customer's own row while the account is active, or an admin.
2. **A private `branding` bucket**, with a folder per customer, using the same policies as `cvs`. The server-side limits allow PNG, JPEG and WebP only (no SVG, which can carry scripts), with a size limit per file. The limits live in `src/lib/constants.ts` too.
3. **RLS tests:** customer B cannot read or change A's row or files.

### Applying the theme (ATS-53)

- A hook reads the row with the query key `["branding", customerId]`.
- The app shell sets `--primary`, `--ring` and `--sidebar-primary` as inline CSS variables from `accent_colour`. That is a runtime value from user data, which `CLAUDE.md` allows, and no component changes.
- `--primary-foreground` is chosen by a small pure function: white or the dark foreground, whichever has the higher WCAG contrast. It is unit-tested.
- A colour is accepted only if the foreground on it reaches 4.5:1 and the colour itself reaches 3:1 against `--background`. The same function checks it in the form and in the zod schema.
- The acting banner and the sign-in page keep the default tokens.

### Settings page (ATS-54)

- **Settings → Appearance**, in the sidebar for customers and for an admin acting for one.
- The colour picker comes first, with six preset accents that are known to pass. A custom hex field is checked live and shows the contrast result.
- The logo upload is shown in the sidebar in place of the Mini-ATS mark, and has an alt text with the company name.
- The preview updates before saving, and saving or resetting is one click. Reset removes the row and the files.

### Background image (ATS-55)

- The image covers the main area behind the content, with a scrim from a theme token at the chosen dim level.
- Cards, tables, columns and panels keep `bg-card` or `bg-column`, so the image shows only in the gaps.
- At 390 px the image is static and cropped to the centre. The file is served through a signed URL that is cached for its lifetime.

## Estimate

2–3 days of focused work, in four tickets: database, theme, settings page and background image.
