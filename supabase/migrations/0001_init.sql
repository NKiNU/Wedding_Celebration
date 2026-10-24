-- 0001_init: schema, RLS, public read surface, atomic post creation, realtime.
-- All writes go through route handlers with the service role; anon/authenticated are read-only.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  groom_name text not null,
  bride_name text not null,
  header_message text default 'Raikan memori anda bersama',
  qr_path text,                 -- R2 key of the admin-uploaded DuitNow QR
  qr_account_name text,         -- shown under the QR so guests can verify
  qr_bank text,
  uploads_open boolean not null default true,
  created_at timestamptz default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz default now()
);
create unique index guests_event_name_ci on public.guests (event_id, lower(name));

create type public.post_type as enum ('photo', 'album', 'video', 'wish');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  type public.post_type not null,
  caption text check (char_length(caption) <= 120),
  wish_text text check (char_length(wish_text) between 3 and 300),
  hidden boolean not null default false,   -- admin moderation
  created_at timestamptz default now(),
  check ((type = 'wish') = (wish_text is not null))
);
-- id is the keyset tie-breaker: with it in the index, "(created_at, id) < ($c, $id)
-- order by created_at desc, id desc limit 24" is a pure index range scan, no sort.
create index posts_wall on public.posts (event_id, created_at desc, id desc) where not hidden;
-- Rate limit: posts by this guest in the last hour (and the join to their media bytes).
create index posts_guest_recent on public.posts (guest_id, created_at);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  position smallint not null,              -- order inside an album
  kind text not null check (kind in ('image', 'video')),
  path text not null,                      -- R2 key of the main file
  thumb_path text,                         -- 600 px grid thumbnail
  poster_path text,                        -- video poster frame
  width int, height int, duration_s numeric,
  bytes bigint not null,
  mime text not null
);
-- Serves media lookup per post, the rate-limit bytes join, FK cascades, and album order.
create unique index post_media_post_position on public.post_media (post_id, position);

create table public.upload_intents (     -- issued by /api/uploads, consumed by /api/posts
  post_id uuid primary key,              -- server-generated; becomes posts.id
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  files jsonb not null,                  -- [{position, key, mime, bytes, role:'main'|'thumb'|'poster'}]
  expires_at timestamptz not null,
  consumed_at timestamptz
);
-- Hourly sweep: expired intents that never became a post.
create index upload_intents_sweep on public.upload_intents (expires_at) where consumed_at is null;

-- Public guest names. Deliberately NOT security_invoker: anon has no grant on guests at all,
-- so an invoker view would fail; this owner-rights view projects only non-secret columns
-- and is the single read path to guests. (Supabase's advisor flags it; that is intended.)
create view public.public_guests with (security_invoker = false) as
  select id, event_id, name from public.guests;

-- ---------------------------------------------------------------- RLS + grants
alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.upload_intents enable row level security;

-- Supabase's default privileges grant ALL to anon/authenticated. Reset to read-only so
-- TRUNCATE (not covered by RLS) and future policy mistakes cannot open writes.
revoke all on public.events, public.guests, public.posts, public.post_media,
  public.upload_intents, public.public_guests from anon, authenticated;
grant select on public.events, public.posts, public.post_media, public.public_guests
  to anon, authenticated;

-- events holds nothing secret: names, header and QR details are meant for every guest.
create policy events_read on public.events for select to anon, authenticated using (true);
create policy posts_read_visible on public.posts for select to anon, authenticated
  using (not hidden);
create policy post_media_read_visible on public.post_media for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and not p.hidden));
-- guests and upload_intents: RLS on, no policies, no grants -> service role only.

-- ---------------------------------------------------------------- functions
-- Filter-pill counts. Invoker rights: for anon RLS already hides hidden posts, and the
-- explicit filter keeps the result identical when the service role calls it.
create function public.wall_counts(e uuid)
returns table (all_count int, photos int, videos int, wishes int)
language sql stable set search_path = '' as $$
  select count(*)::int,
         (count(*) filter (where type in ('photo', 'album')))::int,
         (count(*) filter (where type = 'video'))::int,
         (count(*) filter (where type = 'wish'))::int
    from public.posts
   where event_id = e and not hidden;
$$;

-- Atomic media post: posts + post_media + intent consumed in one transaction (supabase-js
-- cannot run multi-statement transactions). The app derives p_type; table checks re-validate.
-- Errors use PostgREST PTxxx codes so the HTTP status maps directly.
create function public.create_post_from_intent(
  p_post_id uuid,
  p_guest_id uuid,
  p_type public.post_type,
  p_caption text,
  p_media jsonb   -- [{position, kind, path, thumb_path, poster_path, width, height, duration_s, bytes, mime}]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_intent public.upload_intents%rowtype;
begin
  -- Row lock: two concurrent submits of the same intent serialize; the second sees consumed_at.
  select * into v_intent from public.upload_intents
   where post_id = p_post_id and guest_id = p_guest_id
   for update;
  if not found then
    raise exception 'intent_not_found' using errcode = 'PT404';
  end if;
  if v_intent.consumed_at is not null then
    raise exception 'intent_consumed' using errcode = 'PT409';
  end if;
  if v_intent.expires_at <= now() then
    raise exception 'intent_expired' using errcode = 'PT410';
  end if;
  if jsonb_typeof(p_media) is distinct from 'array' or p_media = '[]'::jsonb then
    raise exception 'media_required' using errcode = 'PT400';
  end if;
  -- Only keys the server issued for this intent may be stored.
  if exists (
    select 1
      from jsonb_to_recordset(p_media) as m(path text, thumb_path text, poster_path text),
           unnest(array[m.path, m.thumb_path, m.poster_path]) as k(key)
     where k.key is not null
       and not exists (select 1 from jsonb_array_elements(v_intent.files) f
                        where f ->> 'key' = k.key)
  ) then
    raise exception 'media_not_in_intent' using errcode = 'PT400';
  end if;

  insert into public.posts (id, event_id, guest_id, type, caption)
  values (p_post_id, v_intent.event_id, p_guest_id, p_type, p_caption);

  insert into public.post_media
    (post_id, position, kind, path, thumb_path, poster_path, width, height, duration_s, bytes, mime)
  select p_post_id, m.position, m.kind, m.path, m.thumb_path, m.poster_path,
         m.width, m.height, m.duration_s, m.bytes, m.mime
    from jsonb_to_recordset(p_media) as m(position smallint, kind text, path text,
         thumb_path text, poster_path text, width int, height int, duration_s numeric,
         bytes bigint, mime text);

  update public.upload_intents set consumed_at = now() where post_id = p_post_id;
end;
$$;
-- Security definer + service-only: PUBLIC gets EXECUTE by default, Supabase also grants anon.
revoke all on function public.create_post_from_intent(uuid, uuid, public.post_type, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_post_from_intent(uuid, uuid, public.post_type, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------- realtime
-- Postgres Changes on posts, RLS-filtered per subscriber:
--   INSERT  -> anon receives visible rows.
--   UPDATE  -> anon receives it only if the NEW row is visible, so unhide (hidden=false)
--              arrives as an UPDATE and the client upserts it. Hide (hidden=true) is NOT
--              delivered, because the new row fails posts_read_visible.
--   DELETE  -> delivered to everyone with the primary key only (RLS cannot check a deleted
--              row; with RLS on even REPLICA IDENTITY FULL sends only the PK). The client
--              only needs id, so replica identity stays DEFAULT (no extra WAL).
-- Hide therefore goes out as a Broadcast carrying only {id} on public topic 'wall:<event_id>',
-- event 'post_hidden'. Nothing hidden ever reaches anon beyond its id.
alter publication supabase_realtime add table public.posts;

create function public.broadcast_post_hidden()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'post_hidden',
                        'wall:' || new.event_id::text, false);
  return null;
end;
$$;
revoke all on function public.broadcast_post_hidden() from public, anon, authenticated;

create trigger posts_hidden_broadcast
  after update of hidden on public.posts
  for each row when (new.hidden and not old.hidden)
  execute function public.broadcast_post_hidden();

-- ---------------------------------------------------------------- future objects
-- Later migrations must opt in to anon access explicitly instead of inheriting ALL.
grant execute on function public.wall_counts(uuid) to anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
