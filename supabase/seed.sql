-- Local demo data mirroring the prototype seed. token_hash values are fake (no token hashes to them).
-- Expected wall_counts for 'demo': all 10, photos 4 (2 albums + 2 photos), videos 1, wishes 5.
-- One extra post is hidden (moderation demo) and must never be counted or shown to anon.

insert into public.events (id, slug, groom_name, bride_name)
values ('e0000000-0000-4000-8000-000000000001', 'demo', 'Groom', 'Bride');

insert into public.guests (id, event_id, name, token_hash)
select ('a0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'e0000000-0000-4000-8000-000000000001',
       name,
       lpad(n::text, 64, '0')
  from (values (1, 'Nazrul'), (2, 'Siti'), (3, 'Ali'), (4, 'Aminah'), (5, 'Hafiz'),
               (6, 'Farah'), (7, 'Daniel'), (8, 'Mei Ling'), (9, 'Kumar'), (10, 'Aisyah'))
       as g(n, name);

insert into public.posts (id, event_id, guest_id, type, caption, wish_text, hidden, created_at)
select ('b0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'e0000000-0000-4000-8000-000000000001',
       ('a0000000-0000-4000-8000-0000000000' || lpad(guest::text, 2, '0'))::uuid,
       type::public.post_type, caption, wish_text, hidden,
       now() - make_interval(mins => mins_ago)
  from (values
    (1,  1, 'album', 'Pelamin moments', null, false, 5),
    (2,  2, 'wish',  null, 'Selamat pengantin baru! Semoga berkekalan hingga ke jannah.', false, 12),
    (3,  3, 'photo', 'The cake!', null, false, 20),
    (4,  4, 'video', 'First dance', null, false, 34),
    (5,  5, 'wish',  null, 'Congratulations to the both of you. Wishing you a lifetime of love and laughter.', false, 41),
    (6,  6, 'photo', null, null, false, 55),
    (7,  7, 'wish',  null, 'So happy for you two!', false, 63),
    (8,  8, 'album', 'Family photos', null, false, 80),
    (9,  9, 'wish',  null, 'Barakallahu lakuma wa baraka alaikuma wa jamaa bainakuma fi khair.', false, 95),
    (10, 1, 'wish',  null, 'Thank you all for coming and sharing this day with us.', false, 120),
    (11, 10, 'photo', 'Blurry, please hide', null, true, 130)
  ) as p(n, guest, type, caption, wish_text, hidden, mins_ago);

-- Keys follow events/{eventId}/{postId}/{position}.{ext} (+ _thumb.jpg / _poster.jpg). Objects are fake.
insert into public.post_media
  (post_id, position, kind, path, thumb_path, poster_path, width, height, duration_s, bytes, mime)
select p.id, pos,
       case when p.type = 'video' then 'video' else 'image' end,
       format('events/%s/%s/%s.%s', p.event_id, p.id, pos,
              case when p.type = 'video' then 'mp4' else 'jpg' end),
       case when p.type = 'video' then null
            else format('events/%s/%s/%s_thumb.jpg', p.event_id, p.id, pos) end,
       case when p.type = 'video' then format('events/%s/%s/%s_poster.jpg', p.event_id, p.id, pos) end,
       case when p.type = 'video' then 1080 else 1536 end,
       case when p.type = 'video' then 1920 else 2048 end,
       case when p.type = 'video' then 42 end,
       case when p.type = 'video' then 48000000 else 650000 end,
       case when p.type = 'video' then 'video/mp4' else 'image/jpeg' end
  from public.posts p
  cross join lateral generate_series(0, case p.id
         when 'b0000000-0000-4000-8000-000000000001' then 4   -- Nazrul album: 5 photos
         when 'b0000000-0000-4000-8000-000000000008' then 2   -- Mei Ling album: 3 photos
         else 0 end) as pos
 where p.type <> 'wish';
