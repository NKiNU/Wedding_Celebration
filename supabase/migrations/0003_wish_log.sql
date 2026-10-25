-- 0003_wish_log: deleting a wish must not refund the hourly allowance.
-- Media posts are counted from upload_intents, which outlive their post. Wishes were counted from
-- `posts`, so a guest could send and delete a wish forever. Each wish now leaves a row here that
-- nothing deletes except its guest.

create table public.wish_log (
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index wish_log_guest_recent on public.wish_log (guest_id, created_at);

-- Service role only, like guests and upload_intents: RLS on, no policies, no grants.
alter table public.wish_log enable row level security;
revoke all on public.wish_log from anon, authenticated;

insert into public.wish_log (guest_id, created_at)
select guest_id, created_at from public.posts where type = 'wish';

create or replace function public.guest_usage(p_guest_id uuid, p_since timestamptz)
returns table (posts int, bytes bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.upload_intents i
           where i.guest_id = p_guest_id and i.expires_at > now())
         + (select count(*)::int from public.wish_log w
             where w.guest_id = p_guest_id and w.created_at >= p_since),
         coalesce((select sum((f ->> 'bytes')::bigint)
                     from public.upload_intents i, jsonb_array_elements(i.files) f
                    where i.guest_id = p_guest_id and i.expires_at > now()), 0)::bigint;
$$;

create or replace function public.create_wish(
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
  insert into public.wish_log (guest_id) values (p_guest_id);
  return v_id;
end;
$$;
