-- =============================================================================
-- Frosted chips over the background image, with a visibility setting (ATS-66)
--
-- Since ATS-55 every text over a company's background image sits on a solid card surface. Now the
-- loose text gets small frosted chips instead, and the company chooses how see-through they are.
--
--   * background_floor is the lowest chip opacity that keeps every text readable over this image,
--     measured in the browser when the image is prepared (prepareBackground, src/lib/theme.ts).
--     Null for no background, and for a background uploaded before this ticket, which keeps fully
--     solid chips until it is measured or uploaded again.
--   * surface_opacity is the company's choice, from 0 (clear) to 1 (solid), or null for the
--     default. It is never below the floor.
--
-- Like the accent's contrast (ATS-53), the floor is measured in the browser: the database cannot
-- read the image. A client that sends a wrong floor only changes how its own company's app looks.
--
-- Backwards compatible with the code on main: both columns are nullable and have no default, so
-- an upsert that leaves them out keeps working.
-- =============================================================================

alter table public.customer_branding
  add column background_floor numeric(3, 2)
    constraint customer_branding_background_floor_range
      check (background_floor between 0 and 1)
    constraint customer_branding_background_floor_needs_image
      check (background_floor is null or background_path is not null),
  add column surface_opacity numeric(3, 2)
    constraint customer_branding_surface_opacity_range
      check (surface_opacity between 0 and 1);

alter table public.customer_branding
  add constraint customer_branding_surface_opacity_floor
    check (surface_opacity is null or background_floor is null or surface_opacity >= background_floor);

comment on column public.customer_branding.background_floor is
  'The lowest chip opacity that keeps text readable over the background image, measured in the browser (ATS-66).';
comment on column public.customer_branding.surface_opacity is
  'How solid the chips over the background image are, 0 to 1, never below background_floor; null for the default (ATS-66).';

-- The settings page saves both with the rest of the theme, in its one upsert.
grant insert (background_floor, surface_opacity) on public.customer_branding to authenticated;
grant update (background_floor, surface_opacity) on public.customer_branding to authenticated;
