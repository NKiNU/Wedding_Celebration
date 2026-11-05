-- Photo strip: 3 photos placed in a story-size template (docs/superpowers/plans/2026-11-05-photo-strip.md).

alter type public.post_type add value if not exists 'strip';

alter table public.events
  add column strip_template_path text, -- R2 key of the admin's template; null = the built-in default
  add column strip_windows jsonb,      -- [{x,y,w,h} x3] in template px (1080 x 1920); null = default
  add column event_date date;          -- shown on the default template ("07 Nov 2026")

-- The one layout a phone may ask for; the app still checks the files have the strip shape.
alter table public.upload_intents
  add column layout text check (layout in ('strip'));

-- Strips count under Photos. Compared as text: a new enum value cannot be used as a literal in
-- the transaction that adds it.
create or replace function public.wall_counts(e uuid)
returns table (all_count int, photos int, videos int, wishes int)
language sql stable set search_path = '' as $$
  select count(*)::int,
         (count(*) filter (where type::text in ('photo', 'album', 'strip')))::int,
         (count(*) filter (where type = 'video'))::int,
         (count(*) filter (where type = 'wish'))::int
    from public.posts
   where event_id = e and not hidden;
$$;

-- The couple's wedding date for this deployment's event (owner's request, 2026-11-05).
update public.events set event_date = '2026-11-07' where event_date is null;
