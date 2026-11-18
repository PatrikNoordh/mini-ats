-- =============================================================================
-- A customer's own theme in the database (ATS-52, docs/next-branding.md)
--
--   * customer_branding holds one row per company: its accent colour, the paths of its logo and
--     background image in the branding bucket, and how much the background is dimmed. A company
--     without a row sees Mini-ATS as before. customer_id is a company id (ATS-44), so the row
--     references companies, and is removed with the company.
--   * RLS like the other customer tables: the signed-in member's company while the member and the
--     company are active (current_company_id()), or an admin. A row's owner never changes
--     (keep_customer_id(), as for jobs and candidates), so a client may upsert the whole row.
--   * A private branding bucket with a folder per company, and the same four policies as cvs.
--     Storage refuses anything but PNG, JPEG and WebP (no SVG, which can carry scripts), and files
--     over 2 MB. BRANDING_IMAGE_MIME_TYPES and MAX_BRANDING_IMAGE_BYTES in src/lib/constants.ts
--     are the same: change both.
--   * A path in the row must point into the company's own folder, so a row never names another
--     company's file.
--
-- The accent colour's contrast is checked in the app (ATS-53), not here: it needs the theme's
-- tokens. A colour that skips that check only changes how the company's own app looks.
--
-- Backwards compatible with the code on main: a new table and a new bucket, which no code reads.
-- Deploy order: this migration first, then admin-manage-company and purge-deleted-accounts from
-- main, which remove a company's branding folder when it is deleted for good and need the bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------
create table public.customer_branding (
  customer_id     uuid primary key references public.companies (id) on delete cascade,
  accent_colour   text
    constraint customer_branding_accent_colour_format check (accent_colour ~ '^#[0-9a-f]{6}$'),
  logo_path       text
    constraint customer_branding_logo_path_own_folder
      check (starts_with(logo_path, customer_id::text || '/') and char_length(logo_path) <= 200),
  background_path text
    constraint customer_branding_background_path_own_folder
      check (starts_with(background_path, customer_id::text || '/') and char_length(background_path) <= 200),
  background_dim  text not null default 'medium'
    constraint customer_branding_background_dim_level check (background_dim in ('light', 'medium', 'strong')),
  updated_at      timestamptz not null default now()
);

comment on table public.customer_branding is
  'A company''s own theme (ATS-52). No row means the Mini-ATS theme.';
comment on column public.customer_branding.accent_colour is
  'Lowercase #rrggbb, or null for the Mini-ATS accent. Contrast is checked in the app.';
comment on column public.customer_branding.logo_path is
  'Path in the branding bucket, in the company''s folder, or null for the Mini-ATS mark.';
comment on column public.customer_branding.background_path is
  'Path in the branding bucket, in the company''s folder, or null for no background image.';

create trigger customer_branding_keep_customer
  before update of customer_id on public.customer_branding
  for each row execute function public.keep_customer_id();

create trigger customer_branding_touch
  before update on public.customer_branding
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Row Level Security and grants
--
-- The settings page reads the row, saves it with one upsert and resets it with a delete, so
-- authenticated gets those four. The upsert sets customer_id too; the trigger above refuses a
-- change. updated_at is set by the trigger, so no client writes it.
-- -----------------------------------------------------------------------------
alter table public.customer_branding enable row level security;

create policy "customer_branding_owner_or_admin" on public.customer_branding
  for all
  using (customer_id = (select public.current_company_id()) or (select public.is_admin()))
  with check (customer_id = (select public.current_company_id()) or (select public.is_admin()));

grant select, delete on public.customer_branding to authenticated;
grant insert (customer_id, accent_colour, logo_path, background_path, background_dim)
  on public.customer_branding to authenticated;
grant update (customer_id, accent_colour, logo_path, background_path, background_dim)
  on public.customer_branding to authenticated;
grant all on public.customer_branding to service_role;

-- -----------------------------------------------------------------------------
-- 3. The branding bucket: <company id>/<file name>, private, images only
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "branding_owner_or_admin_read" on storage.objects
  for select using (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

create policy "branding_owner_or_admin_write" on storage.objects
  for insert with check (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

create policy "branding_owner_or_admin_update" on storage.objects
  for update
  using (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  )
  with check (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );

create policy "branding_owner_or_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = (select public.current_company_id())::text
      or (select public.is_admin())
    )
  );
