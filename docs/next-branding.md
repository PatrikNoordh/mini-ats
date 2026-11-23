# Next: a customer's own theme

A design sketch for epic 12, now built: the database part (ATS-52), applying the theme (ATS-53), the settings page (ATS-54), the background image (ATS-55) and its frosted chips (ATS-66).

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

### Settings page (ATS-54, built)

- **Settings → Appearance** (`/settings`), in the sidebar for customers and for an admin acting for one. The page sits behind the customer gate like the other customer pages, so an admin acting for nobody chooses a customer first.
- **The colour** comes first: **Mini-ATS**, six presets that pass the contrast rules (`PRESET_ACCENTS` in `src/lib/theme.ts`, checked by a test), or **Your own colour**. A colour code is checked as it is typed, with the contrast it reaches against the 4.5:1 and 3:1 limits, and the first rule it breaks (`accentProblem()`). Save stays disabled until it passes. A colour picker sits next to the code field.
- **The logo** is a PNG, JPEG or WebP up to 2 MB, checked before upload and again by the bucket. It lives at one fixed path, `<company id>/logo`, so a new logo replaces the old file in the same call and no old logo is left behind. The sidebar shows it in place of the Mini-ATS mark, with the company's name as its alt text; an image that cannot be loaded shows the mark.
- **The preview** is a small copy of the menu, a button and a link, with the draft's tokens set on the preview only. The page itself keeps the saved theme until **Save**.
- **Save** and **Reset to Mini-ATS** are one click each. Reset removes every file in the company's folder first and the row after (`docs/data-safety.md` § 4).

### Background image (ATS-55, built)

- **Nothing readable sits on the image** (decided with the developer while building). A scrim alone cannot promise that: over an all-black image, grey hint text needs about 92% of the page colour on top before it reaches 4.5:1 again. So every element whose text or controls would lie on the page background gets a solid card surface while an image is shown, and the image shows only in the gaps. The dim levels (**Much**, **Some**, **A little** of the image) only change how much of it shows, never whether text is readable.
- **Where text sat on the page:** the page header (title, count, actions and the history page's hint, now in `PageHeader`), the board's filter row, the column tools, the empty, loading and error states, the settings section, the accounts page's section headings, and the history page's **Back to accounts** link. The board's columns and cards, the tables and the side panel already had solid backgrounds. The pages outside the shell, such as sign-in and not found, never show the image.
- **How:** the shell marks `<main>` with `data-background-image` while an image is shown. `.surface-on-image` (card background, border, corners and padding) and `.solid-on-image` (card background only) in `src/styles.css` apply only then, so a page without an image looks as before. They sit outside the CSS layers so they win over an element's own background.
- **Proof:** `e2e/background.spec.ts` sets an all-black and an all-white image and checks every visible text and control in `<main>` for a solid background between it and the image, on the board, the jobs, candidates, settings and accounts pages, as a customer and as an admin acting for one. It also checks the page header, a filter row, an empty state and an error state for the card background.
- **Fast:** the browser makes the image at most 2,560 px on its longest side and saves it as WebP (or JPEG where WebP cannot be written) before upload, which also drops metadata such as where a photo was taken. The file lives at `<company id>/background`, and its signed link is cached for its lifetime. From md up the image stays put while the page scrolls; on a phone it scrolls with the page and is cropped to the centre.
- **The demo** gets a made-up brand on Studio Exempel, drawn by `scripts/demo-brand.ts` when the seed runs, so no image file is in the repo.

### Frosted chips and a visibility setting (ATS-66, built)

ATS-55's full-width solid bars covered much of the image. They are replaced by small chips.

- **Chips, not bars.** With a background image, only loose text gets a chip that hugs it (`.chip-on-image`): the page title and its count, **Reset columns**, the column tools' hints, the history page's back link, the accounts headings and hints, and on **Settings** every label, hint, error and legend (through `Field`). Controls that are solid by themselves need no backing: primary and outline buttons, and the inputs and selects, which get the card colour while an image is shown. The empty, loading and error states stay solid boxes.
- **Frosted glass.** A chip is the card colour at `--surface-opacity` over the image, mixed in sRGB, with a 12 px backdrop blur. The shell sets `--surface-opacity` on `<main>`.
- **The setting and its floor.** **Settings → Appearance** has a slider, **How much of the image shows through the labels**, shown only with a background. It is saved per company in `customer_branding.surface_opacity`, from 0 to 1, and the preview shows it. Its lowest value is `background_floor`, measured in the browser when the image is prepared (`prepareBackground`): the image is drawn 48 px on its longest side, which averages each area like the blur, and `surfaceFloor()` finds the lowest opacity at which muted text and a field error's red, the lightest text on chips, keep 4.5:1 over every area. It is rounded up to 0.01 with 0.05 added. An all-black image gets 0.99, an all-white one 0.05. The page's scrim is left out, since it only lightens. The database checks both ranges and that the setting is never below the floor.
- **A company that has not chosen** gets 0.85, raised to the floor. **A background from before ATS-66** has no floor and keeps fully solid chips; opening **Settings** measures the stored image, and saving stores its floor.
- **Proof.** `e2e/background.spec.ts` sets an all-black and an all-white image with the slider at the floor, and for every visible text the image shows through to, works out what is behind it as the browser draws it (the image, the scrim and every translucent background, mixed in sRGB) and requires 4.5:1, on the board, the jobs, candidates, settings and accounts pages, as a customer and as an admin acting for one.
- **The demo** brand's background measures 0.51; the demo sets its floor at 0.55 and its chips at 0.7, and a unit test checks the floor against the drawn image.

## Estimate

2–3 days of focused work, in four tickets: database, theme, settings page and background image.
