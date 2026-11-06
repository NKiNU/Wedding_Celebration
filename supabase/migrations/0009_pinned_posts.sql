-- Admin pins: a pinned post shows first on the wall (newest pin first). Null = not pinned.
-- A hidden post is never pinned: hiding clears the pin in the same update.
alter table public.posts
  add column pinned_at timestamptz,
  add constraint posts_pinned_visible check (pinned_at is null or not hidden);

create index posts_pinned on public.posts (event_id, pinned_at desc) where pinned_at is not null;
