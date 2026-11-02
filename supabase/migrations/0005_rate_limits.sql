-- 0005_rate_limits: a generic throttle and an event-wide storage cap.
-- Errors use PostgREST PTxxx codes like 0001, so the HTTP status maps directly.
-- There is deliberately no cap on the number of guests: one person could fill it days before the
-- wedding and lock the real guests out. Joining is throttled per IP with rate_limit_hit instead.

-- ---------------------------------------------------------------- generic throttle
-- One row per attempt, bucketed by scope (what is limited, e.g. 'guests', 'wall') and a hashed key
-- (who, e.g. the hashed IP). The attempt is recorded in the same transaction as the check, so
-- parallel requests cannot all see an empty counter (same pattern as admin_login_attempt).
create table public.rate_attempts (
  scope text not null,
  key_hash text not null,
  at timestamptz not null default now()
);
create index rate_attempts_scope_key on public.rate_attempts (scope, key_hash, at);

-- Service role only, like guests and upload_intents: RLS on, no policies, no grants.
alter table public.rate_attempts enable row level security;
revoke all on public.rate_attempts from anon, authenticated;

-- The window is computed here from the database clock, so the app server's clock never matters.
-- The cleanup touches only this (scope, key)'s old rows, the ones this call holds the lock for:
-- callers with other keys never wait on each other's rows. The hourly sweep purges the rest.
create function public.rate_limit_hit(p_scope text, p_key text, p_window_s int, p_max int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_s);
  v_recent int;
begin
  perform pg_advisory_xact_lock(hashtext(p_scope || ':' || p_key));
  delete from public.rate_attempts
   where scope = p_scope and key_hash = p_key and at < v_since;
  select count(*)::int into v_recent from public.rate_attempts
   where scope = p_scope and key_hash = p_key and at >= v_since;
  if v_recent >= p_max then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
  insert into public.rate_attempts (scope, key_hash) values (p_scope, p_key);
end;
$$;

revoke all on function public.rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, int, int) to service_role;

-- ---------------------------------------------------------------- event storage cap
-- Storage queries sum every intent of the event; the table had no index on event_id.
create index upload_intents_event on public.upload_intents (event_id);

-- 0002's function, plus p_max_event_bytes. Only bytes that are really stored count: an intent that
-- became a post which still exists (hidden posts included). A deleted post's intent becomes a
-- tombstone (consumed_at null, cancelled_at set), so it frees its bytes.
-- Reserved-but-unposted intents do NOT count: otherwise throwaway names could fill the cap without
-- uploading anything. Uploads in flight can therefore overshoot the cap a little; that is bounded
-- by the per-guest hourly quota and temporary (the sweep deletes unposted objects).
-- Locks: event first, then guest. create_wish takes only the guest lock and nothing takes the
-- guest lock before the event lock, so the order cannot deadlock.
drop function public.create_upload_intent(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, int, bigint);

create function public.create_upload_intent(
  p_post_id uuid, p_event_id uuid, p_guest_id uuid, p_files jsonb, p_expires_at timestamptz,
  p_since timestamptz, p_max_posts int, p_max_bytes bigint, p_max_event_bytes bigint
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_used record;
  v_adding bigint;
  v_stored bigint;
begin
  perform pg_advisory_xact_lock(hashtext('storage:' || p_event_id::text));
  perform pg_advisory_xact_lock(hashtext(p_guest_id::text));
  select * into v_used from public.guest_usage(p_guest_id, p_since);
  select coalesce(sum((f ->> 'bytes')::bigint), 0) into v_adding from jsonb_array_elements(p_files) f;
  if v_used.posts + 1 > p_max_posts or v_used.bytes + v_adding > p_max_bytes then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
  select coalesce(sum((f ->> 'bytes')::bigint), 0) into v_stored
    from public.upload_intents i, jsonb_array_elements(i.files) f
   where i.event_id = p_event_id
     and i.consumed_at is not null
     and exists (select 1 from public.posts p where p.id = i.post_id);
  if v_stored + v_adding > p_max_event_bytes then
    raise exception 'storage_full' using errcode = 'PT507';
  end if;
  insert into public.upload_intents (post_id, event_id, guest_id, files, expires_at)
  values (p_post_id, p_event_id, p_guest_id, p_files, p_expires_at);
end;
$$;

revoke all on function public.create_upload_intent(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, int, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.create_upload_intent(uuid, uuid, uuid, jsonb, timestamptz, timestamptz, int, bigint, bigint)
  to service_role;

-- The guest list: nothing in the app reads public_guests (author names come from the server), and
-- with it the public anon key could download every name, including guests who never posted (PDPA:
-- keep personal data minimal). The view stays for the service role.
revoke select on public.public_guests from anon, authenticated;
