-- Test-only stand-ins for what hosted Supabase provides, so the real migrations in
-- supabase/migrations run on plain Postgres (backend tests with WM_TEST_DATABASE_URL, internal/testdb).
-- Never apply this to a Supabase project: there these objects already exist.
-- Roles belong to the whole cluster, and test packages create their databases in parallel.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    begin
      execute format('create role %I nologin', r);
    exception when duplicate_object or unique_violation then null;
    end;
  end loop;
end $$;
create schema realtime;
create table realtime.messages (topic text, extension text, event text, payload jsonb, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select null::text $$;
-- Records the broadcast so a test can see that hiding a post would reach open phones.
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
language sql as $$ insert into realtime.messages (topic, extension, event, payload, private) values (topic, 'broadcast', event, payload, private) $$;
create publication supabase_realtime;
