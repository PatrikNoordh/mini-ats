# Next: a customer's own theme

A design sketch for epic 12. The database part (ATS-52) and applying the theme (ATS-53) are built; the rest is not built yet.

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

### Database (ATS-52, built)

`supabase/migrations/20261119120000_customer_branding.sql`.

1. **A `customer_branding` table**, one row per company:
   - `customer_id` is the primary key and references `companies`, on delete cascade. The sketch said `profiles`, from before ATS-44 made every `customer_id` a company id.
   - `accent_colour` is a lowercase `#rrggbb` hex colour, with a format check, or null for the Mini-ATS accent, so a company can have a logo without its own colour.
   - `logo_path` and `background_path` are nullable paths in the `branding` bucket. A check keeps each inside the company's own folder.
   - `background_dim` is one of `light`, `medium` or `strong`, `medium` by default.
   - `updated_at`, set by the database.

   RLS and explicit grants work like the other tables: a member of the company while the member and the company are active, or an admin. `authenticated` may select, insert, update and delete, so the settings page saves with one upsert and resets with a delete. The row's owner never changes (`keep_customer_id()`, as for jobs and candidates).
2. **A private `branding` bucket**, with a folder per company, using the same four policies as `cvs`. Storage allows PNG, JPEG and WebP only (no SVG, which can carry scripts), at most 2 MB per file. `BRANDING_IMAGE_MIME_TYPES` and `MAX_BRANDING_IMAGE_BYTES` in `src/lib/constants.ts` are the same, and a unit test keeps the two in step.
3. **Deleting a company for good** removes its branding folder right after its CV folder (`_shared/company-purge.ts`), so no file outlives the row that named it.
4. **RLS tests:** checks 67 and 68. Customer B cannot read or change A's row or files.

The contrast rule below is checked in the app, not in the database: it needs the theme's tokens. A colour that skips it only changes how that company's own app looks.

### Applying the theme (ATS-53, built)

- `useBranding` reads the row with the query key `["branding", customerId]`, and `useCustomerTheme` in the app shell applies it. The tokens come from `themeTokens()` in `src/lib/theme.ts`, a pure function.
- **On `<html>`, not on the shell.** Dialogs, menus and the mobile sidebar render in portals outside the shell, so the variables are set on `<html>` while the shell is mounted and removed when it unmounts. The sign-in page and the other pages outside the shell keep the Mini-ATS theme. The values are runtime values from user data, which `CLAUDE.md` allows.
- **The tokens:** the accent sets `--primary`, `--ring`, `--sidebar-primary` and `--sidebar-ring`. `--primary-foreground` and `--sidebar-primary-foreground` are white or the dark foreground, whichever has the higher WCAG contrast (`textOnAccent()`). `--accent` and `--sidebar-accent`, the hover and active-item backgrounds, become a 12% tint of the accent, with the dark foreground as their text.
- **The accent as text** (ATS-53, decided while building): links and the active sidebar item used `text-primary`, so a light accent that passes the 3:1 rule for buttons would have been text below 4.5:1. They now use a token of their own, `--primary-text`, which is the Mini-ATS accent without a theme. With a theme it is the accent, darkened toward the foreground in 5% steps until it reaches 4.5:1 on the background, the cards and both tints. A test sweeps 4,096 accents and checks every text the theme sets.
- **A colour is used only if** the text on it reaches 4.5:1 and the colour itself reaches 3:1 against `--background` (`isReadableAccent()`, for the form and the zod schema in ATS-54). The database cannot check contrast, so a colour that fails is ignored when the theme is applied, and the app keeps the Mini-ATS accent.
- **The acting banner** has the class `.theme-mini-ats`, which puts every themed token back to the Mini-ATS value. Each themed token is a `--mini-ats-*` default on `:root`, and a test checks that `.theme-mini-ats` and `THEMED_TOKENS` list the same tokens.
- While the theme loads, and if it fails to load, the app shows the Mini-ATS accent. It is decoration, so a failure shows no error.

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
