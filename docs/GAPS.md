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
