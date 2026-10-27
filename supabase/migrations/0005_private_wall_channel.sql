-- 0005_private_wall_channel: only the database may send on the wall's broadcast topic.
-- The hide trigger used a public topic, and on a public topic any client holding the anon key
-- (it ships in the page) can also send: a script could broadcast `post_hidden` for every post id
-- and make every phone drop posts and refetch. On a private topic Realtime checks RLS on
-- realtime.messages: anon may receive on `wall:*` (select) and nobody may send (no insert policy).
-- Clients subscribe with `config: { private: true }` (src/lib/realtime.ts).

create or replace function public.broadcast_post_hidden()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'post_hidden',
                        'wall:' || new.event_id::text, true);
  return null;
end;
$$;

create policy wall_receive on realtime.messages
  for select to anon, authenticated
  using (extension = 'broadcast' and realtime.topic() like 'wall:%');
