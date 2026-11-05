# Gaps: traffic on the wedding day

Open risks for a busy event, from a review on 2026-11-03. None of these is fixed in code yet.
Numbers marked *(verify)* are from memory; check them on the provider's pricing page before the event.

## 1. Realtime connection cap (biggest risk)

- **What:** every open wall keeps one Supabase Realtime connection. The free tier allows about 200 at once,
  Pro about 500 *(verify)*. `docs/DEPLOY.md` assumes the free tier.
- **What happens past the cap:** the **new** connection is refused; phones already connected are not
  kicked. supabase-js keeps retrying, so a refused phone joins as soon as a slot frees (iOS drops the
  socket when a phone locks or the tab goes to the background, so slots free often).
- **What a refused phone still sees** (`src/components/wall/useWall.ts`): the full wall on load, a refetch
  after its own post, and a refetch every time the guest comes back to the tab. It does not see other
  guests' posts appear while it is looking at the wall.
- **Options:**
  1. Upgrade Supabase to Pro for the event month if more than ~200 phones may be open at once. No code.
  2. Fallback polling: when the channel reports `CHANNEL_ERROR` / `TIMED_OUT`, refetch page 1 every
     15–30 s until it subscribes. Small change in `realtime.ts` + `useWall.ts`, needs a test.

## 2. Fan-out on every new post

- **What:** one new post makes every connected phone refetch page 1 (`GET /api/posts`). 300 phones and a
  post every 2 s ≈ 150 requests/s on the VPS and Supabase. The 500 ms debounce merges bursts on one phone,
  not across phones, so all phones fetch at nearly the same moment.
- **Option:** add 0–2 s random jitter to the debounce (one line in `useWall.ts`). Do it only if the load test
  shows slow responses.
- **Check:** `LOAD_PHONES=<guest count> SUPABASE_INTEGRATION=1 npx vitest run tests/integration/load.test.ts`
  against a staging copy (100 phones passed on a laptop, slowest 17 s).

## 3. Venue Wi-Fi

- **What:** files go phone → R2 directly, so the server is not the bottleneck; the venue's uplink is. Many
  80 MB videos on one shared connection will be slow or stall (the client has a 45 s stall watchdog).
- **Option:** the MC or a sign says "use mobile data if the Wi-Fi is slow". No code.

## 4. VPS size

- **What:** `npm start` is one Node process. Check CPU and memory under the load test on the real VPS
  (1 vCPU / 1 GB is the expected minimum).

## 5. Supabase free project pauses

- **What:** free projects pause after about a week with no activity *(verify)*. Open the app the day before
  the wedding, and check the dashboard that morning.

## 6. Realtime message quota

- **What:** each post sends one message to every connected phone. 300 phones × 1 000 posts = 300 000
  messages; the free tier allows about 2 million a month *(verify)*. Fine for one event, worth a glance.

## 7. Post limit is per name, not per phone

- **What:** `POSTS_PER_HOUR` (30) and `BYTES_PER_HOUR` (200 MB) are counted per guest (`guest_id`), and wishes
  count as posts. A phone can hold 5 names (`MAX_NAMES_PER_PHONE`), so one phone can reach 150 posts / 1 GB
  an hour. CLAUDE.md says "per device". Either fix the wording or count by token set; the event's 9 GB cap
  still bounds the total.
- **Open question:** is 30 posts an hour too low for a keen guest? (Asked 2026-11-03, undecided.)

## 8. No `Retry-After` on 429

- Already listed in `docs/PLAN.md` as "not fixed, on purpose". The rate-limit messages tell the guest to wait.

## 9. Photo strip is not full width in the viewer

- **What:** the viewer shows a strip inside `AlbumGallery`'s photo frame, which is `aspect-4/5`. The strip is
  9:16, so it is contained by the frame's height and leaves dark bands on both sides: on a 390 px phone the
  frame is about 390 × 487 and the strip only about 274 px wide (~70 %). Found 2026-11-05.
- **Fix (planned, local):** give strips a 9:16 frame (`aspect-9/16` instead of `aspect-4/5`, strips only) in
  `src/components/viewer/AlbumGallery.tsx`. The strip then fills the height between header and caption and is
  nearly full width on most phones. Truly edge to edge would need vertical scroll or cropping the top/bottom
  (where the names and date are), so not planned.

## 10. Photo strip Share: not yet checked (built 2026-11-05)

The owner-only Share sheet (`src/components/viewer/StripShare.tsx`) is done in code: unit tests, lint,
typecheck and build pass. Still open:

- **Real phones:** iPhone Safari and Android Chrome. Tap Share → the phone's share menu opens with the image;
  WhatsApp (chat + status), Facebook (feed + story) and Instagram Stories get the full 1080 × 1920 image,
  uncropped; on iPhone, Save Image puts it in Photos; closing the menu leaves our sheet open; Save to phone
  lands in the gallery / Downloads on Android and in Files on iPhone.
- **E2E:** `npm run test:e2e` was not run (needs local Supabase / Docker). No e2e test covers Share yet; one
  could stub `navigator.canShare` / `navigator.share` and check the owner-only button and the one-file call.
- **Pull request:** none yet for `claude/modest-cori-2wwy2a` → `main`.

## 11. Media storage past 9 GB: spill over to the VPS (planned, not built)

- **Today:** the event's posted media is capped at 9 GB (`MAX_EVENT_MB`, checked in `src/server/uploads.ts`).
  At the cap, photo and video uploads are refused; viewing and wishes keep working.
- **Wanted (2026-11-05):** when R2 reaches 9 GB, store new media on the VPS that hosts the app ("storage
  spillover" / capacity-based storage routing). Cheaper alternative: R2's free tier is not a hard cap; past
  10 GB it bills about US$0.015 per GB-month *(verify)*, so raising `MAX_EVENT_MB` costs cents and needs no code.
- **Trade-offs:** VPS disk must have room (check `df -h`); overflow uploads and views go through the VPS
  (put its media domain behind the Cloudflare proxy to cache images); one disk, no redundancy (copy the media
  off after the event); the VPS must accept only signed, size-checked uploads.
- **Plan:**
  1. Migration: `store text not null default 'r2' check (store in ('r2','vps'))` on `post_media` and the
     upload intent's files. QR, monogram and strip template stay on R2.
  2. `create_upload_intent` picks the store: under 9 GB → R2, else VPS, with its own cap `MAX_VPS_MB`.
  3. `src/server/localStore.ts` implements the existing `R2` interface (`presignPut, head, peek, read,
     deleteMany, purge`) over a media folder `MEDIA_DIR` (e.g. `/var/lib/wedding-media`), same
     `events/{eventId}/{postId}/…` keys.
  4. `PUT /api/media/upload/...` stands in for R2's presigned URL: HMAC-signed, expiring link
     (`MEDIA_UPLOAD_SECRET`), exact declared size and content type, no `..` / absolute paths, write to a temp
     file then rename. Same origin, so the client's upload code and progress bars stay as they are.
  5. Caddy/nginx serves `MEDIA_DIR` directly on a media subdomain behind Cloudflare (not through Node), with
     `nosniff`, no `Content-Disposition`/`Content-Encoding` tricks, long cache.
  6. `mediaUrl` builds the link from each file's `store` (`MEDIA_VPS_BASE_URL` for the VPS).
  7. Delete post, hourly sweep, admin hide/delete and zip download, owner strip download: all follow `store`.
  8. Env vars `MEDIA_DIR`, `MEDIA_VPS_BASE_URL`, `MAX_VPS_MB`, `MEDIA_UPLOAD_SECRET` in `env.ts` /
     `.env.example`; `docs/DEPLOY.md`: folder + permissions, proxy block, upload body size (80 MB videos),
     backup and disk checks.
  9. Tests: switch at 9 GB, bad signature / size / path rejected, delete and sweep on both stores, URLs per
     store. Record the decision as ADR 005.
- **Size:** about 12–15 files plus a migration. Needs a real database and the real VPS to check.
- **Open:** how much free disk the VPS has (sets `MAX_VPS_MB`).
