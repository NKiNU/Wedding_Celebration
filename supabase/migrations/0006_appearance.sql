-- 0006_appearance: the admin picks the fonts and uploads a monogram image.
-- All four are nullable: null means "use the default font" / "show the initials monogram".
-- `events` is already readable by anon and written only through the service role, so no policy change.

alter table public.events
  add column font_names text,      -- key from src/lib/domain/fonts.ts (couple names, monogram)
  add column font_wishes text,     -- wish text
  add column font_body text,       -- everything else
  add column monogram_path text;   -- R2 key of the admin-uploaded monogram image
