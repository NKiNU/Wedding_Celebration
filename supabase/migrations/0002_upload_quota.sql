-- 0002_upload_quota: the hourly allowance is checked and spent in one transaction, and a cancelled
-- upload keeps counting (and cannot be posted) until its window ends.
-- Errors use PostgREST PTxxx codes like 0001, so the HTTP status maps directly.

-- A cancelled intent stays as a tombstone: it keeps its quota until it expires, and the hourly
-- sweep deletes its objects again once the presigned URLs are dead (a URL can re-create a file).
alter table public.upload_intents add column cancelled_at timestamptz;

-- ---------------------------------------------------------------- usage
-- What a guest has used since p_since. The intent TTL equals the window, so an intent that has not
-- expired was created inside it, posted or not, cancelled or not. Wishes have no intent.
create function public.guest_usage(p_guest_id uuid, p_since timestamptz)
returns table (posts int, bytes bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.upload_intents i
           where i.guest_id = p_guest_id and i.expires_at > now())
         + (select count(*)::int from public.posts p
             where p.guest_id = p_guest_id and p.type = 'wish' and p.created_at >= p_since),
         coalesce((select sum((f ->> 'bytes')::bigint)
                     from public.upload_intents i, jsonb_array_elements(i.files) f
                    where i.guest_id = p_guest_id and i.expires_at > now()), 0)::bigint;
$$;
revoke all on function public.guest_usage(uuid, timestamptz) from public, anon, authenticated;

-- Check and spend in one transaction. The advisory lock serialises one guest's requests, so 50
-- parallel requests cannot all see an empty allowance.
create function public.create_upload_intent(
  p_post_id uuid, p_event_id uuid, p_guest_id uuid, p_files jsonb, p_expires_at timestamptz,
  p_since timestamptz, p_max_posts int, p_max_bytes bigint
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_used record;
  v_adding bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_guest_id::text));
  select * into v_used from public.guest_usage(p_guest_id, p_since);
  select coalesce(sum((f ->> 'bytes')::bigint), 0) into v_adding from jsonb_array_elements(p_files) f;
  if v_used.posts + 1 > p_max_posts or v_used.bytes + v_adding > p_max_bytes then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
  insert into public.upload_intents (post_id, event_id, guest_id, files, expires_at)
  values (p_post_id, p_event_id, p_guest_id, p_files, p_expires_at);
end;
$$;

create function public.create_wish(
  p_event_id uuid, p_guest_id uuid, p_text text,
  p_since timestamptz, p_max_posts int, p_max_bytes bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_used record;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_guest_id::text));
  select * into v_used from public.guest_usage(p_guest_id, p_since);
  if v_used.posts + 1 > p_max_posts or v_used.bytes > p_max_bytes then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
  insert into public.posts (event_id, guest_id, type, wish_text)
  values (p_event_id, p_guest_id, 'wish', p_text)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_upload_intent(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, int, bigint)
  from public, anon, authenticated;
grant execute on function public.create_upload_intent(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, int, bigint)
  to service_role;
revoke all on function public.create_wish(uuid, uuid, text, timestamptz, int, bigint)
  from public, anon, authenticated;
grant execute on function public.create_wish(uuid, uuid, text, timestamptz, int, bigint) to service_role;

-- ---------------------------------------------------------------- posting
-- 0001's function, plus: a cancelled intent can never become a post.
create or replace function public.create_post_from_intent(
  p_post_id uuid,
  p_guest_id uuid,
  p_type public.post_type,
  p_caption text,
  p_media jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_intent public.upload_intents%rowtype;
begin
  select * into v_intent from public.upload_intents
   where post_id = p_post_id and guest_id = p_guest_id
   for update;
  if not found then
    raise exception 'intent_not_found' using errcode = 'PT404';
  end if;
  if v_intent.consumed_at is not null then
    raise exception 'intent_consumed' using errcode = 'PT409';
  end if;
  if v_intent.cancelled_at is not null or v_intent.expires_at <= now() then
    raise exception 'intent_expired' using errcode = 'PT410';
  end if;
  if jsonb_typeof(p_media) is distinct from 'array' or p_media = '[]'::jsonb then
    raise exception 'media_required' using errcode = 'PT400';
  end if;
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
