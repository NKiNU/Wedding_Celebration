-- 0004_admin: throttle for admin passcode guesses.
-- An attempt is recorded before the passcode is checked, so parallel guesses cannot all see an
-- empty counter. A correct passcode clears the caller's rows (admin_login_clear).

create table public.admin_attempts (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index admin_attempts_ip on public.admin_attempts (ip_hash, at);

-- Service role only, like guests and upload_intents: RLS on, no policies, no grants.
alter table public.admin_attempts enable row level security;
revoke all on public.admin_attempts from anon, authenticated;

create function public.admin_login_attempt(p_ip_hash text, p_since timestamptz, p_max int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_recent int;
begin
  perform pg_advisory_xact_lock(hashtext('admin_login:' || p_ip_hash));
  delete from public.admin_attempts where at < p_since;
  select count(*)::int into v_recent from public.admin_attempts where ip_hash = p_ip_hash;
  if v_recent >= p_max then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
  insert into public.admin_attempts (ip_hash) values (p_ip_hash);
end;
$$;

create function public.admin_login_clear(p_ip_hash text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.admin_attempts where ip_hash = p_ip_hash;
$$;

revoke all on function public.admin_login_attempt(text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.admin_login_attempt(text, timestamptz, int) to service_role;
revoke all on function public.admin_login_clear(text) from public, anon, authenticated;
grant execute on function public.admin_login_clear(text) to service_role;
