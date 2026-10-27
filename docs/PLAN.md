# Wedding Memories — Development Plan

## Progress (update at the end of every session)

- [x] Phase 0 — Foundation (carry-overs below)
- [x] Phase 1 — Identity + Welcome
- [x] Phase 2 — Wall (read)
- [x] Phase 3 — Create
- [x] Phase 4 — View + own content
- [x] Phase 5 — QR + Admin
- [x] Phase 6 — Hardening + launch (hardening done; launch steps listed in the notes below)

Last session notes (2026-10-28, Phase 6; the hardening is done and committed, the launch steps are for the user and the R2 friends):
- **Built:**
  - Flood guards (`src/server/rateLimit.ts`, in the process's memory, one VPS): `rateLimit(bucket, address, max, windowMs)`, `ipBucket` (IPv6 by its /64 **after expanding `::`**), `clientIp` (moved here from `admin.ts`). Wired into `POST /api/guests` (300 / min and 600 / h per address) and `GET /api/posts` (6000 / min); limits in `limits.ts` are ceilings sized for a venue where every guest shares one Wi-Fi address, because every open phone refetches the wall on each new post. Bounded: a pass drops ended windows at most every 10 s, and past 50 000 live addresses the oldest tenth is forgotten (fails open; the proxy is the defence at that scale).
  - Guest cap `MAX_GUESTS_PER_EVENT` = 20 000 (429 `guest_limit`), a table guard, not a headcount. Wall ticker: `getLatestWishes` + `wishes` in the first-page response, `useWall` keeps them (the ticker used to depend on which 24 posts were loaded and vanished after a run of photos). Ticker pauses under pointer or focus (separate states) and has a visible pause button (the dots; a pause glyph while paused).
  - Migration `0005_private_wall_channel.sql`: `post_hidden` is sent on a **private** Realtime topic; anon may only receive on `wall:*` (policy on `realtime.messages`), nobody may send. `realtime.ts` joins with `private: true`.
  - `next.config.ts` security headers (`frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, referrer policy, empty Permissions-Policy, COOP). No script/connect CSP on purpose (see DEPLOY.md "Hardening").
  - Origin check (the fallback for browsers without `Sec-Fetch-Site`) compares the full origin, with the scheme taken from the proxy's `X-Forwarded-Proto` (behind a TLS-terminating proxy `req.url` says http while the browser's Origin says https). Missing header: fail closed; DEPLOY.md tells nginx users to set it. `R2_ENDPOINT` is now refused under `NODE_ENV=production` (a local `npm start` against local storage sets `ALLOW_DEV_R2_ENDPOINT=1`). `GET /qr` fetch times out at 10 s.
  - **R2 placeholder:** `purge(keys)` on the R2 adapter (`src/server/r2.ts`) is an empty function, called by `removePost` after the files are deleted (failure logged, never blocks). `docs/R2-SETUP.md` is the handoff for the friends: bucket, token scope, CORS, media-domain headers, edge cache TTL rule, the purge to implement, and a proof checklist.
  - Docs: `docs/DEPLOY.md` (Supabase prod, env file, systemd bound to 127.0.0.1, Caddy replacing the address headers, Cloudflare note, ufw, hourly cron with a header file, launch checklist, limits), `docs/R2-SETUP.md`, a real `README.md`. `scripts/check-bundle.mjs` (`npm run check:bundle`: no secret value or server-only name in `.next/static` or the prerendered pages; proven to fail on a planted name).
  - Tests: `tests/integration/rls.test.ts` (anon cannot read `guests` / `upload_intents` / `admin_attempts` / `wish_log`, sees `public_guests` without a token hash, cannot write through any table or the view, never sees a hidden post or its media, gets `42501` on every service-only function with full argument lists, can receive but **not send** on the private wall topic, `admin_login_attempt` lets exactly 5 of 8 parallel guesses through) and `tests/integration/load.test.ts` (N phones join, post a wish and a photo; `LOAD_PHONES`).
- **Decisions:**
  - Per-address limits are deliberately loose (the review and the security audit both found the first values, 600 reads and 120 joins a minute, would lock out a whole venue). A bot can still fill the guest table slowly; the SQL clean-up is in DEPLOY.md. No CAPTCHA (name only, no accounts).
  - Passcode minimum stays 8 characters (changing it would break existing `.env` files); DEPLOY.md says to use `openssl rand -base64 18`.
  - Storage-cost abuse across many scripted guests (event-wide hourly byte cap) is **not** built: the per-address join limits bound it, and it needs a migration; revisit if the event is public.
  - The e2e flake from the Phase 4 notes is still there: the iPhone WebKit join spec misses its 5 s redirect against a cold dev server.
- **Verified:** lint, typecheck, `npm test` (658 unit, 24 integration skipped by default; 98.43% statements, 95.52% branches, 96.52% functions), `npm run build` (with `ALLOW_DEV_R2_ENDPOINT=1` because `.env.local` points `R2_ENDPOINT` at local storage) and `npm run check:bundle` green. `SUPABASE_INTEGRATION=1 npx vitest run tests/integration`: uploads 11, delete 4, rls 8 pass; the 30-phone burst passes against `npm start` (6 s for the whole crowd, slowest phone 5.7 s) and 100 phones all succeed (slowest 17 s on this laptop with Docker; the dev server is slower). Headers checked with `curl -I` on `next start`. A public Realtime channel was shown to accept a forged broadcast, the private one does not.
  - Playwright MCP walk by a Sonnet agent at 390x844 (and 412x915 for the wall and Photos drawer), all 13 canvas screens in both themes against the served canvas: matches. Differences it found and left: an extra privacy sentence on the welcome screen (CLAUDE.md asks for one), "Send a gift" vs "Money gift" and the QR title copy, the viewer's photo is centred in the stage (the canvas top-aligns it), the viewer counter has no visible pill on the dark theme, sheet and chip offsets of 3 to 12 px. Mobile-native audit: no tap target under 44 px, inputs at 16 px, no horizontal scroll, viewport meta correct, no ungated hover, safe-area on FAB, sheets, toast and viewer.
  - Accessibility: dialogs are named and trap focus, Escape returns focus to the trigger, contrast of `--muted` on paper is 5.5:1, reduced motion handled.
- **Reviews:** security (Opus): no CRITICAL. Fixed: the two HIGH (venue-sized limits, a bot filling the guest cap), forged `post_hidden` broadcasts (migration 0005), the limiter's memory and CPU, IPv6 bucketing, the Origin fallback, the `R2_ENDPOINT` guard, headers, the QR fetch timeout, the doc claims (firewall, Cloudflare, cron secret off `ps`, loopback bind). Code review (Sonnet): fixed the venue limits, the RLS test that proved nothing (partial arguments), a vacuous sweep test, ticker states clobbering each other, `clientIp` living in `admin.ts`, and several DEPLOY.md errors (build env, admin lockout lives in Postgres, "never writes").
  - **Not fixed, on purpose:** no `Retry-After` on 429; `refresh()` still ignores a failed refetch silently; the invisible-ring finding of the walk was a measurement of the 150 ms outline transition (the ring is ink; the pill no longer transitions its outline); focus drops to `<body>` after confirming a delete in the Me drawer (the trash button is gone); the "Post deleted" toast also says that for a wish; no left/right safe-area padding (landscape on a notched iPhone); `theme-color` stays the light colour on the dark viewer; captions keep bidi-override characters; zip entry names such as `CON` fail to extract on Windows; `public_guests` lists every guest name (needed for names on posts); a stolen admin cookie cannot be revoked except by changing the passcode.
- **Commit-time security review (automated), after the commit:** three MEDIUM findings. (1) The Origin fallback ignored the scheme: fixed, it now compares the full origin using `X-Forwarded-Proto`. (2) The guest cap can still be used up by a bot: acknowledged, not changed. The cap is 20 000, one address gets 600 joins an hour (a venue shares one address, so that cannot go lower), and DEPLOY.md has the SQL clean-up and the proxy block; a join code would fix it for good but changes how guests arrive (CLAUDE.md: name only). (3) The limiter forgets the oldest tenth past 50 000 live addresses: acknowledged. Failing closed there would lock out real guests instead of letting a flood from 50 000 distinct addresses through, and at that scale the reverse proxy is the defence.
- **Not run this session (say so, do not assume):** the full Playwright suite on both phone profiles ran once (8 passed, then the WebKit join flake skipped the rest) and the rerun was stopped by the system for low memory, so **`npx playwright test` and `--project=admin` need one more run on a freshly reset database** (`supabase db reset`, recreate the bucket, `ADMIN_PASSCODE` in the shell). The admin dashboard was not re-audited in the browser (the passcode could not be typed by the agent); the Phase 5 pass stands. The video file picker with a real video was not driven.
- **Needs the user, the friends and real phones (launch):**
  1. R2 (friends): follow `docs/R2-SETUP.md` (bucket, token, CORS, media domain, headers, Cache Rule, implement `purge`), then run its proof checklist.
  2. Deploy: `docs/DEPLOY.md` (production Supabase project and event row, env file, systemd, Caddy, firewall, cron, `check:bundle`), then the launch checklist, including `rls.test.ts` against the production project and the load test against a **staging copy**.
  3. Real devices: the "To try after deploy" list below, plus the Realtime private channel on hosted Supabase (turn **Allow public access** off in Realtime settings), Download QR on iPhone and Android, an old iPhone (no `Sec-Fetch-Site`) joining and posting through the real proxy, and a slow-3G video upload.
- **Housekeeping:** the low-memory stop came from the dev server, a second `next start`, Docker and two browsers at once; close what you do not need before the full e2e. `.playwright-mcp/` is gitignored. A static server for the canvas runs on port 8110 (python `http.server`, from the session scratchpad). Docker needed `quit Docker Desktop and start it again` (the `wsl --terminate docker-desktop` step failed with "no distribution", and `wsl --shutdown` was not needed). `db reset` wipes the seed's media, recreate the `wedding` bucket after it. The local database holds test guests from the review walk until the next reset.

Earlier session notes (2026-10-26, Phase 5; uncommitted, the user commits):
- **Built:**
  - Migration `0004_admin.sql`: `admin_attempts` (hashed IP + time) with `admin_login_attempt` / `admin_login_clear` (advisory lock, attempt counted **before** the passcode is compared, 5 per 15 min). RLS on, service role only. `database.types.ts` regenerated (also picks up `wish_log`).
  - Domain: `qrKey`, `qrProblem`, PNG in `looksLike`, `QR_MIMES`, `MAX_QR_BYTES`, `ADMIN_*` limits.
  - Server `admin.ts`: `login` (sha256 + `timingSafeEqual`), cookie `wm_admin` = `expires.HMAC(expires)` keyed by passcode + pepper (httpOnly, **SameSite=Strict**, 24 h; changing `ADMIN_PASSCODE` signs everyone out), `requireAdmin` / `isAdmin`, `updateEvent`, `presignQr` / `confirmQr` (key must match `events/{eventId}/admin/qr-<uuid>.(png|jpg)`, HEAD + 16-byte peek + size + no header override, then the old QR file is deleted), `getQrObject`, `getModerationPage`, `setHidden`, `mediaManifest` (pages of 1000: PostgREST caps a response). `posts.ts`: `removePost` is shared by `deletePost` (owner by token) and `deletePostAsAdmin`. `event.ts` exports `EVENT_COLUMNS` and now reads the QR fields. `sweep.ts`: `purgeAdminAttempts`, called by the hourly cron.
  - Routes: `/api/admin/session` (POST login, DELETE logout), `/event` (PATCH), `/qr` (POST presign, PUT confirm), `/posts` (GET), `/posts/[id]` (PATCH hide, DELETE), `/media` (GET manifest); public `GET /qr` streams the QR from the media domain on the app origin (`<a download>` and `navigator.share({files})` need same origin).
  - Guest UI: `QrDrawer` + `useQrFile` (the file is fetched when the drawer opens so `navigator.share` runs inside the tap), DuitNow QR item at the visual top of `ActionMenu`, `uploadsOpen` / `qr` props on `Wall`. Uploads closed: the menu keeps only the QR with "Sharing is closed", the empty-state call to action is hidden.
  - Admin UI `/admin` (`components/admin/`): login, couple names + header message, uploads switch, QR upload (presign, PUT, confirm) + holder + bank, posts list with Hide / Unhide / Delete (`ConfirmDialog`), "Download zip" (`client-zip` in the browser, one file at a time). Each section shows its own error. No canvas screen exists for admin: it uses the same tokens and `ui/` parts, single column up to `max-w-2xl`.
  - Tests: unit and component (614+), `tests/e2e/admin.spec.ts` (own Playwright project `admin`, runs last, needs `ADMIN_PASSCODE` in the shell, skipped otherwise).
- **Decisions:**
  - Admin login lasts 24 h; throttle bucket is the hashed IP (IPv6 by its /64). `clientIp` trusts only what our own infrastructure sets: `x-vercel-forwarded-for` when `VERCEL` is set, else the reverse proxy's `x-real-ip`, else the last `x-forwarded-for` entry. Never the first entry or a Vercel header on a VPS: a client could change it on every try and switch the throttle off.
  - Admin edits show on the next wall load (no Realtime on `events`); `getEvent` is per request, so nothing needs revalidating.
  - Hide keeps the files (reachable by URL); Delete is the takedown, same as for guests.
- **Verified against the real stack (local DB, the R2 bucket in `.env.local`):** wrong passcode 401, 6th try 429, no cookie 401 on every admin route, hide drops the wall count and unhide restores it, closed uploads give a guest 403 `uploads_closed`, QR presign / PUT / confirm / foreign key 400 / `GET /qr` 200 with `no-store`, manifest, logout. Browser (390x844): login, wrong passcode, dashboard, no console errors beyond the dev hydration warning. `npx playwright test --project=admin --no-deps`: 3 of 3 (login; hide, unhide and delete reach a second phone live; closing uploads leaves only the QR). Found by the browser pass: `Date.now()` in `isAdmin` failed prerendering, fixed with `await connection()` (same in `/qr`).
- **Reviews:** security (Opus): no CRITICAL or HIGH. Fixed: IPv6 /64 bucketing, zip entry names (a guest named `..`), `admin_attempts` purge. **Not fixed, on purpose:** the passcode only needs 8 characters (`ADMIN_PASSCODE`); a longer random one is the real defence against guessing, because the admin can change the QR and the name shown under it. A shared venue network can lock the admin out for 15 min after 5 wrong tries (switch to mobile data). QR presigned URLs live 15 min and an unconfirmed QR upload is never swept (admin only, small). `/qr` is `no-store`. Admin sessions cannot be revoked except by changing the passcode. Code review (Sonnet): no HIGH. Fixed: manifest cut at 1000 posts, `/qr` dynamic, 44 px switch, per-section errors, stale QR file and a failed image never retried, trimmed compare, `EVENT_COLUMNS`, CORS message for the zip.
- **Needs the real bucket and phones (Phase 6):**
  1. **CORS GET on the media domain** for the app origin, or "Download zip" fails ("Check that the media domain allows downloads"). Add to the bucket checklist next to the `PUT` rule.
  2. Real R2 must reject a PUT whose `Content-Type` / `Content-Length` differ from the signed ones, and `Content-Disposition` / `Content-Encoding` on the QR (local storage ignores them).
  3. **Download QR** on a real iPhone (share sheet offers Save Image) and an Android Chrome; the long-press hint on iOS.
  4. Zip download of a real event on a laptop (memory: the finished zip is held in the tab; for a very large event copy `events/<id>/` from the bucket instead).
  5. Delete must purge the CDN copy (carry-over from Phase 3/4).
  6. Set a long random `ADMIN_PASSCODE` in production (`openssl rand -base64 18`).
  **Deploy target is a VPS, not Vercel (decided 2026-10-26).** Phase 6 needs, instead of the Vercel steps:
  - HTTPS in front (Caddy, or nginx + certbot). The session cookies are `Secure`: over plain http phones cannot join at all.
  - The reverse proxy must set the client address: nginx `proxy_set_header X-Real-IP $remote_addr;` and `proxy_set_header X-Forwarded-For $remote_addr;` (replace, do not append), or the admin login throttle sees every visitor as one address.
  - Run `npm run build` then `npm start` (Node 22.12 or newer) under systemd or pm2, with the env vars from `.env.example` in the service's environment file (not in git). Keep `R2_ENDPOINT` empty (Phase 6: the guard now also fires on `NODE_ENV=production`; `ALLOW_DEV_R2_ENDPOINT=1` opts a local `npm start` in).
  - The hourly sweep is not Vercel Cron: add a system cron line `0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/sweep`.
  - After changing `ADMIN_PASSCODE` or any env var, restart the service.
  - CLAUDE.md "Deploy" line now says VPS (changed with the user's yes). The older Vercel mentions below (Phase 3 cron note, Phase 6 list) are superseded by this block.
  7. An anon-client check of `admin_attempts` and the `PT429` mapping on hosted Supabase.
- **Checks:** lint, typecheck, test (620 unit, 15 integration skipped by default; 98.35% statements, 95.45% branches) and build green; admin e2e 3 of 3. No integration test yet for `admin_login_attempt` (a parallel burst and "anon cannot read `admin_attempts`"): add with the Phase 6 anon-client check.

Last session notes (2026-10-25, Phase 4):
- **Built:**
  - Server: `deletePost` (posts.ts), `getPost` and `getMyPosts` (wall.ts, sharing `visiblePosts`), `DELETE /api/posts/[id]`, `GET /api/me/posts`. Delete: ownership by token (`guest_id` match, event-scoped), 404 if gone, 403 if not yours, files removed **before** the row (a storage failure keeps the row so the guest can retry), then the consumed upload intent goes back to a tombstone (`consumed_at` null, `cancelled_at` set) so the hourly sweep removes files a replayed presigned PUT re-created. R2 is used only through the existing `r2().deleteMany`; no bucket work was needed.
  - Migration `0003_wish_log.sql`: wishes are counted from `wish_log` (never deleted), not from `posts`, so deleting a wish does not refund the hourly allowance (found in review). `guest_usage` and `create_wish` replaced; existing wishes backfilled.
  - UI: `/p/[id]` (`PostViewer`, `AlbumGallery` = native scroll-snap + prev/next + "2 / 5" + thumbnail strip, `VideoPlayer` = native `<video controls playsinline>` with poster), `not-found.tsx` for a deleted or malformed link, `MeDrawer` (own posts, delete, Switch name), `useMyPosts`, `useSwitchName`, `useDeletePost` + `ConfirmDialog` (native `<dialog role=alertdialog>`), "Delete my wish" in `WishViewDrawer`, name chip is now the Me button with the chevron, `TrashIcon`, `lib/flash.ts` (one-shot message for the screen that follows). Token `--overlay-soft`. `useWall` gets `drop(id)`.
  - Toast: the visible copy is a `popover="manual"` (top layer) so it shows above an open drawer; the live region is a separate `sr-only` element. Tests and e2e select the visible copy with `p` / `.toast`.
- **Decisions:**
  - `/p/[id]` is a plain route, not an intercepting route over the wall (as planned). Back goes to the page before (`history.length > 1`), else `/wall`. The client router (`cacheComponents`) can hand the wall a stale payload, so after a delete the viewer does a **full load** of `/wall` (`location.replace`), and `useWall` now refetches page 1 on the **first** Realtime connect too (a reconnect still restarts the list).
  - `BottomSheet` reports `close` only while the parent still says `open` (its own close echoed back and undid a parent that had moved on, e.g. Me → share menu).
  - Switch name: `DELETE /api/session`, then `location.replace("/")` (a hard load, so the welcome page re-reads the cookies and Back cannot return to the wall).
  - Me drawer lists the newest 100 own posts (`MY_POSTS_MAX`), fetched when it opens. Hidden posts are not listed, but their author can still delete one by id.
  - `ConfirmDialog` is rendered before the sheets in `Wall` so it closes first and focus returns to the sheet's button.
  - Album arrows dim (`aria-disabled`) at the ends instead of hiding, so keyboard focus is kept.
- **Verified:** Playwright MCP at 390x844 and 412x915 (hi-fi and wireframe) against canvas Hi09, Hi10, Hi12, Hi13 and the Toast: matches. Real stack: delete removes the files (404 on the media URL) and the row, foreign delete 403, bad id 400, already gone 404, replayed `POST /api/posts` after a delete 410, 31st wish after a delete 429. Found by the browser pass: the stale wall after a viewer delete (fixed, above). Console clean apart from the dev-only hydration warning Playwright causes by injecting `caret-color` into inputs.
- **Checks:** lint, typecheck, test (518 unit, 15 integration skipped by default; 99.09% statements, 96.32% branches) and build are green. `SUPABASE_INTEGRATION=1 npx vitest run tests/integration`: 15 of 15. `E2E_UPLOADS=1 npx playwright test`: all pass on a freshly reset database; parallel WebKit workers sometimes miss the 5 s join redirect while the dev server compiles a route (they pass with `--workers=1`). Run `supabase db reset` (and recreate the bucket) before the full run: the create and view specs add posts and the join and wall specs count the seed.
- **Reviews:** security (Opus): no CRITICAL or HIGH; the MEDIUM (a replayed presigned PUT could re-create a deleted post's files with nothing to clean them up) is fixed with the tombstone. Code review (Sonnet): the HIGH (wish quota refunded by delete) is fixed with migration 0003; also fixed: focus order after a confirm, `MeDrawer` calling the API (now `useSwitchName`), arrows hiding under focus, a refresh error hidden behind a stale list, `tabindex` on a one-photo track, a dark Suspense fallback, integration tests for delete. **Not fixed, on purpose:** `useWall.refresh` does not filter ids in `removed` (it would block an admin unhide in Phase 5; a stale response at worst flickers a deleted post until the DELETE event); ("Back" leaving the app, a shared link losing its target and a wish link not opening its drawer were fixed afterwards: see "Phase 4 follow-up" below); deleted media may live in the CDN cache until Phase 6 sets `Cache-Control` / purges; a non-owner gets 403 (not 404) for a hidden post's id.
- **Needs a real phone (Phase 6):** the "Post deleted" toast is announced by a live region outside an open modal, which screen readers may skip (check VoiceOver and TalkBack; if silent, announce from inside the dialog); the album swipe feel and the thumbnail strip on a real iPhone; a MOV/HEVC video on Android Chrome (the player shows "can't be played on this phone" on error).
- **Carry-overs left for Phase 5 and 6:** unchanged from the Phase 3 list below.

Phase 4 follow-up (2026-10-26, uncommitted until reviewed):
- **Back stays in the app.** A card tap (wall or Me drawer) stores the post id in `sessionStorage` (`lib/fromWall.ts`). The viewer's Back uses history only when that id matches and the tab has history, else it goes to `/wall`.
- **Shared links keep their target.** `/p/<id>` with no name redirects to `/?next=/p/<id>`. `nextParam` (validation.ts) accepts only `/p/<uuid>`, so it cannot be an open redirect. `useJoin(known, next)` goes there after joining or "Continue as", and skips the wall's "Tap + to share" greeting.
- **A wish link opens its drawer.** `/p/<wishId>` renders the wall (`app/wall/WallContent.tsx`, shared with `/wall`) with `openWish`, so the URL stays `/p/<id>` and a refresh reopens the drawer. **Not** a redirect to `/wall?wish=`: a `/wall` page that reads `searchParams` stalled the client navigation after joining on iPhone WebKit (join spec failed 4 of 4; passed with the file reverted).
- **Checks:** lint, typecheck, test (527 unit; 99.03% statements, 96.36% branches) and build green. Playwright MCP (390x844): link, join, post, Back to wall; card tap, Back by history; wish link opens the drawer; a hostile `next` is ignored. New e2e specs in `view.spec.ts`; they pass on Android Chrome.
- **Open:** the iPhone WebKit join spec is flaky against the dev server (5 s redirect). Over 6 runs: 3 failures with these changes, 1 on the committed code, which is within noise but worth a second look; it passes on a warm server run alone. A failed join also skips every later spec in the full run.

**To try after deploy (real phones and the real R2 bucket; the user will test these):**

Must do (together with the general Phase 6 pass: post photos, a video and a wish on an iPhone and an Android, including a slow-3G upload):
1. **Shared link from WhatsApp.** Send an album link to a phone with no name yet. Expect: welcome screen, type a name, land on that album; Back goes to the wall, not to WhatsApp. Repeat with a wish link (the wish drawer should be open) and with a link when already joined. Fixed and checked on desktop; not yet tried from a real chat app.
2. **HEVC video on Android Chrome.** Film on an iPhone (.mov, HEVC), open on an Android. Expect "This video can't be played on this phone". If that happens, decide whether to convert to H.264 before upload (a big job, so find out early).

Optional:
3. **Deleted media in the CDN cache.** Matters only if a deleted photo must not stay reachable by its URL. Cheaper than testing: when the bucket is set up, give uploads a short `Cache-Control` and purge the URL on delete (Phase 6). To test: post a photo, open it on a second phone, delete it on the first, reopen the exact image URL on the second.
4. **Album swipe feel on a real iPhone.** No dedicated test: swipe an album once while doing the pass above. It uses the browser's native scroll-snap; fix only if it feels bad (snaps one photo at a time, no overshoot, no fight with page scroll).

Skipped on purpose:
- Screen reader and the "Post deleted" toast (VoiceOver / TalkBack). Only matters for screen-reader guests or if accessibility is a requirement. If it is: delete from the Me drawer and, if nothing is announced, announce from inside the open drawer.
- The flaky iPhone WebKit join e2e spec (5 s redirect against the dev server; 3 of 6 failures with the follow-up changes, 1 of 6 on the committed code). It is a dev-server timing issue, not a phone test; a deployed build probably will not show it. Revisit only if joining feels slow on a real iPhone.


Earlier notes (2026-10-25, Phase 3; still current):
- **Built:**
  - Domain (pure): `uploads.ts` (`uploadProblem`, `derivePostType`, `mediaKey`, `fitWithin`, `videoProblem`), `rateLimit.ts` (`intentUsage`, `rateLimitProblem`), new limits in `limits.ts`. `validation.ts` gets `createUploadBody`, `createPostBody` (exactly one of `postId` / `wishText`; the type is never read), `storedFiles`, `postIdParam`.
  - Server: `r2.ts` (aws4fetch presign with signed `Content-Type` and `Content-Length`, HEAD, DELETE; one retry), `identity.requireGuest(jar)`, `uploads.ts` (`createUploadIntent`, `cancelUploadIntent`, `guestUsage`, `assertUploadsOpen`), `posts.ts` (`createWish`, `createMediaPost`). Routes: `POST /api/uploads`, `DELETE /api/uploads/[postId]`, `POST /api/posts`. No migration: `create_post_from_intent` from 0001 is used as written and its `PT404/409/410/400` codes map straight through PostgREST.
  - Client: `lib/media.ts` (resize to 2048 px JPEG plus 600 px thumb, video duration and poster), `lib/upload.ts` (XHR PUT, progress, 45 s stall watchdog), `useCreatePost` (intent, parallel PUTs, post, cleanup), `Fab`, `ActionMenu`, `WishDrawer`, `PhotoDrawer`, `VideoDrawer`, `UploadProgress`, `CaptionField`, `ui/Button`; `BottomSheet` gets drag-to-dismiss and `busy`; `EmptyState` call-to-action; `Wall` owns one `sheet` state and refetches page 1 after a post (`useWall.refresh`). "Tap + to share." is in the welcome toast.
  - Tokens: `--fab-shadow`, `--dial-shadow`, `--dial-border` (hi-fi and wireframe).
  - Tests: unit and component (411), `tests/e2e/create.spec.ts`, and `tests/integration/uploads.test.ts` (11 tests incl. a parallel burst, cancel-keeps-quota and fake JPEGs; run with `SUPABASE_INTEGRATION=1`, skipped otherwise).
- **Decisions:**
  - Intent TTL is 60 min and presigned URLs last 15 min (ADR 003 amended): a 100 MB video on slow 3G must not hit `PT410`.
  - The rate limit is counted from `upload_intents` (not posts): in-flight uploads count, deleting a post does not free quota, wishes are counted from `posts`. This closes the Phase 0 carry-over. It is per guest, not per phone (CLAUDE.md says per device; the schema has no device id).
  - `uploads_open` is enforced in all three write paths now (403 `uploads_closed`); Phase 5 only adds the admin toggle.
  - `cancelUploadIntent` expires the intent with one atomic `UPDATE ... WHERE consumed_at IS NULL` before deleting objects, so a post committed after a lost response keeps its files and one mid-commit fails with `PT410`. The client treats `already_posted` as success (no duplicate on retry).
  - The poster's own phone refetches page 1 (no optimistic insert); a post the active filter would hide switches the filter to All.
  - Dev-only `R2_ENDPOINT` / `R2_REGION` point the same adapter at local Supabase Storage (S3 API, public bucket `wedding`), so browser and integration runs exercise real signed PUTs. `R2_ENDPOINT` is refused when `VERCEL_ENV=production` or `NODE_ENV=production` unless `ALLOW_DEV_R2_ENDPOINT=1` (Phase 6); empty values mean unset.
  - Wish and caption length are counted in code points (like Postgres `char_length`); two emoji used to pass zod and fail the DB check with a 500.
  - Menu items are Wish, Video, Photos top to bottom (Photos nearest the thumb, as in the canvas); chips are 12 px so two fit a row in Poppins; the toast sits above the + button.
  - Playwright projects: the create specs run after join and wall (they add posts; wall counts the seed).
- **Verified against the real stack (local Supabase + its S3 endpoint, 2026-10-25):** the S3 endpoint refuses a PUT whose size or type differs from the signed one (403); the full intent, PUT, post, replay and cancel-after-post flow; client-claimed `type: "video"` ignored (stored as `photo`); foreign guest gets 404 on post and cancel; expired intent gives 410 and its objects and row are cleaned; 31st post gives 429 (also for wishes) and 3 x 75 MB gives 429; a post before the files arrive gives 400. Browser (Playwright MCP, 390x844 and 412x915, hi-fi and wireframe) compared with canvas Hi03/Hi04/Hi05/Hi07 (and Hi06 error state): matches except the 15 px desktop scrollbar, a 3 px sheet-title offset, and the name chip chevron (Phase 4). A real MP4 recorded in the page gave a poster, duration and card. Console clean. `npx playwright test`: 22 of 22 (join, wall, create on iPhone WebKit and Pixel Chromium).
- **Checks:** lint, typecheck, test (425 unit, 11 integration skipped by default; 99.02% statements, 96.18% branches) and build are green.
- **Reviews:** code review (Sonnet): no CRITICAL; the HIGH (double-tap sent a wish twice, drawer closable mid-send), the stalled-upload lock-in, the native `close` event bypassing `busy`, a duplicate post after a lost response, focus after closing the menu, object URLs created inside a state updater, the progress announcement and `video.load()` are fixed with tests. Security review (Opus): no CRITICAL or HIGH. Fixed: unsigned `Content-Disposition` / `Content-Encoding` on an uploaded object now fails the HEAD check (needs confirming on real R2: local Storage ignores those headers), `R2_ENDPOINT` refused in production, the two-emoji wish, an intent that cannot be presigned is released. **Fixed afterwards (same phase, migration 0002):**
  - Cancel keeps the intent as a tombstone (`cancelled_at`): it still counts against the hour, cannot be posted (410), and `GET /api/cron/sweep` (new, `CRON_SECRET` bearer, constant-time compare) removes the objects again once the presigned URLs are dead, which also closes the "URL re-creates a deleted file" hole.
  - The quota check and the spend are one database call under a per-guest advisory lock (`create_upload_intent`, `create_wish`): 42 parallel requests gave exactly 30 x 201 and 12 x 429.
  - Uploaded files must start like their declared type (JPEG, MP4/MOV, WebM): ranged `GET` of the first 16 bytes; `storedFilesOf` turns a malformed DB row into a 500, not a 400.
  - `domain/rateLimit.ts` is gone (the database owns the check).
  **Still deferred (needs the real bucket or infra):** conditional PUT (`If-None-Match: *` signed and sent; confirm R2 supports it first, then `presignPut`, `putFile` treating 412 as done, bucket CORS) or a server-side copy to a final key, so the owner cannot overwrite a file after it is posted; the media-domain rule (see Phase 6); and the 60 s video limit stays client-side (the 100 MB cap is the real limit).
- **Carry-overs:**
  - Phase 5: unhide must reach every phone (the Realtime UPDATE path; keep it in mind if `useWall.refresh` ever filters `removed`), QR item in `ActionMenu` (the menu is laid out bottom-up, add it at the end of the visual top), admin toggle for `uploads_open`, "hide" leaves media reachable by URL (delete is the takedown and must purge the cache).
  - Phase 6: schedule the sweep hourly (`0 * * * *`; check the Vercel plan allows it, Hobby crons may be limited to daily, otherwise call the route from another scheduler), guest cap and rate limit on `POST /api/guests` and `GET /api/posts`, the deferred security items above, bucket setup (token scoped to one bucket; CORS `PUT` from the app origin with `content-type`, plus `if-none-match` if adopted; `nosniff`, strip `Content-Disposition` / `Content-Encoding` and set `Cache-Control` at the media domain; purge on delete), real-R2 check of the signed headers, real iPhone and Android devices incl. drag feel of the sheet, 44 px targets, safe areas and slow-3G upload, ticker pause control, CI E2E needs `supabase db reset` and `next start` over http drops `Secure` cookies.
  - Still open: R2 bucket, CORS and custom domain (the user does this); per-file `// @vitest-environment node` for server tests that need crypto or fetch.
- **Local setup:** `.env.local` points `R2_*` at local Supabase Storage (`R2_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3`, `R2_REGION=local`, the keys from `supabase start`, `NEXT_PUBLIC_MEDIA_BASE_URL=http://127.0.0.1:54321/storage/v1/object/public/wedding`). After `supabase db reset`, recreate the bucket: `POST /storage/v1/bucket {"id":"wedding","name":"wedding","public":true}` with the service-role key. Seed posts have no files, so their thumbnails 404 and fall back to the soft tone. Do not rewrite `.env.local` with PowerShell `Set-Content -Encoding utf8` (BOM). If the Docker engine returns HTTP 500: quit Docker Desktop, `wsl --terminate docker-desktop`, start it again.
- **Housekeeping:** `.claude/`, `.agents/` and `skills-lock.json` are still untracked; the user decides. A dev server that this session did not start is still on port 3000 (auto mode refused to kill it; HMR picked up the changes) and a static server for the canvas files runs on ports 8099 and 8100 from session scratchpads. Builder worktrees under `.claude/worktrees/` can be removed with `git worktree remove`.

Blocked on the user: Cloudflare R2 bucket, API token and media custom domain (develop against the in-memory R2 stub until then); production Supabase project (needed at launch only).

Session rules:
1. Read this file and `CLAUDE.md` first.
2. Start each phase by invoking the skills in "Working method".
3. End each phase with all checks green, then a commit. Tick the box above and write the session notes.

## Context

The project is new: `C:\Users\acer\Desktop\Wedding` holds only `CLAUDE.md`. The spec is `CLAUDE.md`. The design reference is the canvas "Wedding Memories App" (13 hi-fi screens plus a wireframe theme; its `Main.dc.html` contains every screen, the theme tokens and the interaction logic). Goal: a mobile web app where guests share photos, albums, videos and wishes on one live wall and find the couple's DuitNow QR. It must be easy to maintain after the event: tokens can be re-themed, the domain rules are tested, and the layers are thin.

Decisions made with the user:
- **Media (photos, videos, posters, thumbnails, QR) goes to Cloudflare R2**, not Supabase Storage. Supabase stays for Postgres and Realtime.
- **One wedding per deployment**, selected by `EVENT_SLUG`. The schema keeps `event_id`, so supporting several events later is a small change.
- **Testing:** TDD, 80% coverage everywhere: unit, component, integration and E2E.

(`C:\Users\acer\Desktop\CLAUDE.md` describes an unrelated AI training platform. It is ignored here.)

---

## Architecture

```
Browser (Safari iOS / Chrome Android)
  │  RSC pages + client islands (drawers, uploads, realtime)
  │
  ├──► Next.js route handlers  (/api/*)  ── zod ── identity ── service ── Supabase (service role)
  │          │                                              └── R2 (S3 API: presign, head, delete)
  │          └─ only the server holds secrets
  │
  ├──► R2 (presigned PUT, direct from phone, XHR progress)
  ├──► R2 public custom domain (media.<domain>) for reads
  └──► Supabase Realtime (anon, RLS-filtered `posts` changes)
```

### Layering rules (main maintainability lever)

| Layer | Folder | Allowed to import | Holds |
|---|---|---|---|
| Domain (pure) | `src/lib/domain/` | nothing app-specific | `normalizeName`, `suggestNames`, `derivePostType`, media limits, rate-limit math, relative time. 100% unit tested, no I/O |
| Validation | `src/lib/validation.ts` | zod, domain | every request body and env var |
| Server services | `src/server/` (`import 'server-only'`) | domain, db, r2 | `identity.ts`, `posts.ts`, `uploads.ts`, `admin.ts`, `r2.ts`, `db.ts`, `event.ts` |
| Route handlers | `src/app/api/**/route.ts` | services, validation | parse, then authenticate, then call a service, then map to a response. Under 30 lines each |
| UI | `src/components/**` | domain (formatting), client libs | no fetch logic inside presentational components; data access lives in `src/components/**/use*.ts` hooks |

- One `ApiResult` shape: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`. Services throw typed `AppError(code, status)`; one `handle()` wrapper maps them to responses.
- Config: `src/server/env.ts` parses `process.env` with zod at boot and fails fast. Limits live in `src/lib/domain/limits.ts` as named constants (`MAX_PHOTOS = 10`, `MAX_VIDEO_BYTES = 100 * MB`, `MAX_VIDEO_SECONDS = 60`, `POSTS_PER_HOUR = 30`, `BYTES_PER_HOUR = 200 * MB`, `PAGE_SIZE = 24`).
- Decisions are recorded in `docs/adr/NNN-title.md`, one short page each. First ADRs: R2 for media, one event per deployment, upload intents.

---

## Changes to CLAUDE.md (do in Phase 0, as an ADR as well)

- Replace "Supabase Storage / signed upload URLs / bucket `media`/`admin`" with R2: presigned PUT, public custom domain, key `events/{eventId}/{postId}/{position}.{ext}` (+ `{position}_thumb.jpg`, `{position}_poster.jpg`); QR at `events/{eventId}/admin/qr-{uuid}.{ext}`.
- Env adds `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_MEDIA_BASE_URL`, `EVENT_SLUG`, `CRON_SECRET`.
- Data model additions: `post_media.thumb_path`, `post_media.bytes`, `post_media.mime`, and the `upload_intents` table (below).
- Tailwind v4 maps tokens with `@theme inline` inside `theme.css`, so there is no `tailwind.config.ts`.

---

## Data model (migration `0001_init.sql`)

Use the CLAUDE.md schema as written, plus:

```sql
alter table post_media add column thumb_path text, add column bytes bigint not null, add column mime text not null;

create table upload_intents (            -- issued by /api/uploads, consumed by /api/posts
  post_id uuid primary key,              -- server-generated; becomes posts.id
  event_id uuid not null references events(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  files jsonb not null,                  -- [{position, key, mime, bytes, role:'main'|'thumb'|'poster'}]
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create view public_guests as select id, event_id, name from guests;   -- never exposes token_hash
create function wall_counts(e uuid) returns table(all_count int, photos int, videos int, wishes int) ... -- deterministic filter counts
```

- RLS is on for every table. `anon` may select `events`, `posts where not hidden`, the `post_media` of visible posts, and `public_guests`. There are no anon write policies: all writes go through the service role.
- Realtime publication on `posts`. Clients handle INSERT, DELETE (PK only) and UPDATE (upsert; unhide arrives this way). RLS stops a `hidden=true` UPDATE from reaching anon, so hiding is sent as a Broadcast instead: a trigger calls `realtime.send({id}, 'post_hidden', 'wall:<event_id>', private=false)` and clients drop that id. If the broadcast fails, the post stays visible until the next refetch.
- Writes with several statements (post + media + consume intent) go through `create_post_from_intent(...)`, a security definer function callable only by service_role. It raises `PT404/PT409/PT410/PT400`.
- Keyset pagination on `(created_at desc, id desc)` uses the existing `posts_wall` index.
- `seed.sql`: one event (slug `demo`), roughly 10 guests and posts that mirror the prototype seed (Nazrul album, Siti wish, ...).

---

## Key flows

**Identity** (`src/server/identity.ts`), following the CLAUDE.md [rule] exactly:
- `createGuest(name)` → `normalizeName` → insert. A unique-violation `23505` returns `409 { suggestions: suggestNames(name, takenSet) }`. Token is `crypto.randomBytes(32)`. The database stores `sha256(token + pepper)` only.
- Cookies `wm_tokens` (JSON array, max 5, the oldest is dropped) and `wm_active`: `httpOnly; Secure; SameSite=Lax; Max-Age=1y`.
- `requireGuest(req)` reads `wm_active`, hashes it, looks up the guest and checks `event_id`. Every write uses it.

**Upload: never trust client paths or type**
1. Client prepares files (`src/lib/media.ts`):
   - Photos: `createImageBitmap`, then canvas, giving a 2048 px long-edge JPEG (q 0.82) and a 600 px thumbnail. HEIC decodes natively on Safari; on a decode failure, show a friendly error.
   - Video: read `duration` from `<video>` metadata, reject over 60 s or over 100 MB early, and capture a poster frame at 0.5 s.
2. `POST /api/uploads { files:[{role, mime, bytes, position}] }`. The server checks limits and rate limits, creates `postId` and an `upload_intent` (15 min TTL), and returns presigned PUT URLs. The signature includes **exact `Content-Length` and `Content-Type`**, so R2 rejects anything else.
3. Client uploads each file with XHR PUT and shows per-file progress from `upload.onprogress`.
4. `POST /api/posts { postId, caption }` or `{ wishText }`. The server loads the intent (it must belong to the active guest and be unconsumed), runs `HEAD` on each key in R2 to verify size and type, and derives `type` from the verified main files via `derivePostType`. It then inserts `posts` and `post_media` in one transaction and marks the intent consumed.
5. On failure, the client calls `DELETE /api/uploads/{postId}`. A safety net: an hourly cron call (a system cron line on the VPS) to `/api/cron/sweep`, guarded by `CRON_SECRET`, deletes R2 objects of expired, unconsumed intents.

R2 client: `aws4fetch` (tiny, fetch-based) for presigning, HEAD and DeleteObjects. R2 bucket CORS allows PUT from the app origin.
`ponytail:` uploads are a single PUT with no resume. If reports from the venue show failed large videos, upgrade to presigned multipart.

**Rate limit:** one SQL query per write: posts by this guest's device in the last hour, plus `sum(bytes)`. The pure check function lives in the domain layer. No Redis.

**Delete:** `DELETE /api/posts/[id]` runs `requireGuest`, then checks `post.guest_id === guest.id` (by token, never by name), deletes the R2 objects (main, thumb, poster) and then deletes the row. Realtime pushes the removal to other phones.

**Admin:** `POST /api/admin/session` compares the passcode with `ADMIN_PASSCODE` in constant time (`timingSafeEqual`). It sets an httpOnly cookie holding `HMAC(passcode-version)`, and login attempts are rate-limited. Pages under `/admin` check the cookie in a server layout. Media zip: the admin page uses `client-zip` to stream from the public media URLs in the browser, so no server memory or timeout limits apply.

---

## UI build approach

- **Tokens:** `src/styles/theme.css` holds the CLAUDE.md `:root` tokens (exact values from the prototype's `theme()`) plus `[data-theme="wireframe"]` (the prototype's wireframe branch). `@theme inline { --color-ink: var(--ink); ... }` maps them to Tailwind. An ESLint rule (`no-restricted-syntax` on hex literals / font names in `src/components`) enforces the [rule].
- **Decor:** `<Decor>` components (floral line SVG, lace frame, halftone) render only when `data-decor="on"`.
- **Native first:**
  - `BottomSheet` is a `<dialog>` opened with `showModal()`, which gives focus trap, Escape, top layer and inert background for free. Drag handle: a small pointer handler. Focus returns to the trigger. `prefers-reduced-motion` turns off the slide animation.
  - Album gallery uses CSS `scroll-snap` with prev/next buttons (`scrollBy`), the "2 / 5" counter from `IntersectionObserver`, and a thumbnail strip.
  - Infinite scroll: an `IntersectionObserver` sentinel.
  - Times: `Intl.RelativeTimeFormat`.
  - Download QR: `navigator.canShare({files})` with `share`, else `<a download>` plus a long-press hint.
- **Data on the client:** the wall page is an RSC that renders the first 24 posts and the counts. A `useWall` hook merges Realtime events and later pages; a `useSession` hook wraps `/api/session`. No global state library: React state plus context for the session and toast.
- Components follow the CLAUDE.md folder list one-to-one (`wall/`, `drawers/` with one drawer per file, `viewer/`, `ui/`). Markup and copy are copied from `Main.dc.html` (labels, hints, empty states, the confirm text "Delete this {kind}? Guests will not see it anymore. This cannot be undone.").
- Mobile checklist from CLAUDE.md: 16 px inputs, `100dvh`, `env(safe-area-inset-*)`, `viewport-fit=cover`, 44 px targets, `playsinline`, no `capture` attribute.

---

## Working method (skills and tools for every phase)

| Step | Tool | When and how |
|---|---|---|
| UI/UX design | `/frontend-design:frontend-design` | Before building each screen or component group. It turns the canvas screens into a component spec: typography scale, spacing, states (empty, loading, error, uploading), motion and polish. The output is tokens and markup decisions only, so it never adds hex values to components. |
| Mobile feel | `/mobile-native` | Right after frontend-design for the same screen, and again in Phase 6 as an audit. It covers viewport meta and safe areas, `100dvh`, 16 px inputs, tap highlight, `:hover` only under `@media (hover:hover)`, `overscroll-behavior` on drawers and the wall, long-press text selection on buttons, the bottom-sheet drag, and status-bar `theme-color`. |
| Code | `/ponytail` (project skill in `.claude/skills/ponytail`) | Invoked at the start of every coding task. Follow its ladder: does the code need to exist, then is it already in the repo, then stdlib, then a native platform feature, then an installed dependency, then the minimum code. Mark deliberate shortcuts with `ponytail:` comments. Ponytail never removes validation, security, accessibility or the 80% coverage rule. |
| E2E testing | Playwright MCP (`mcp__plugin_playwright_playwright__*`) | Every phase ends with an MCP-driven pass on the running `npm run dev` app at phone viewports (390×844 iPhone, 412×915 Android). Steps: navigate, fill and click through the flow, check the accessibility snapshot, read console and network errors, and take screenshots to compare with the canvas screens. Flows that pass are then written as `@playwright/test` specs so CI can repeat them, because the MCP cannot run in CI. |

### Subagents

Built-in agent types: `Explore`, `Plan`, `general-purpose`, `fork`. Project agents live in `.claude/agents/`: `code-reviewer`, `security-reviewer`, `tdd-guide` and `e2e-runner`. Each one sets its model in its frontmatter, and the Agent call still passes `model` explicitly (see Model policy). Project skills live in `.claude/skills/` (`mobile-native`, `mobile-app-ui-design`, the animation skills, `apple-design`, `emil-design-eng`, `prototype`, `pick-ui-library`).

| Role | Agent type | Model | When | Runs |
|---|---|---|---|---|
| Codebase lookup | `Explore` | `sonnet` | Before changing an area that is new to the session ("where is X used", "is there already a helper for Y") | Foreground, read-only |
| Phase planning | `Plan` | `opus` | Start of Phases 2 to 5: break the phase into tasks against the real code | Foreground, read-only |
| Parallel builders | `general-purpose` with `isolation: "worktree"` | `sonnet` | Tasks in a phase that do not share files, for example each of the three drawers in Phase 3, or the admin pages alongside the QR drawer in Phase 5. Each builder follows the per-screen loop and ponytail, and returns a diff summary | Background, in parallel (max 3) |
| Test writer (TDD) | `tdd-guide` | `sonnet` | Writes failing tests from the spec before the builder implements, for domain rules, route handlers and components | Foreground, before the build |
| Code review | `code-reviewer` | `sonnet` | After each phase's code is in, before commit: correctness, the layering rules, the ponytail checklist, coverage gaps | Background, run alongside the security review |
| Security review | `security-reviewer` | `opus` | After Phases 1, 3, 4 and 5 (identity, uploads, delete, admin), and the full Phase 6 audit: token handling, cookies, RLS, presign scope, secrets in the bundle | Background, run alongside the code review |
| E2E runner | `e2e-runner` (Playwright MCP) | `sonnet` | End of each phase: walks the flows at phone viewports against the dev server, compares them with canvas screenshots, and reports failures with screenshots | Background, while I fix review findings |

### Model policy

**Never use Haiku**, for the main session or any subagent. This is a standing rule from the user.

Default to **Sonnet**. Use **Opus** only where deep reasoning pays for itself.

| Work | Model |
|---|---|
| Scaffolding, config, components, drawers, styling, route handlers, tests, refactors, E2E runs, codebase lookups, code review, docs, ADRs, commits | **Sonnet** |
| Phase planning (`Plan` agent), the security reviews (identity, uploads, delete, admin, Phase 6 audit), the database migration and RLS policies (Phase 0), the upload intent pipeline design (Phase 3), and a bug that Sonnet has failed to fix twice | **Opus** |

How to apply it:
- **Main session:** run `/model sonnet` at the start of a building session. Switch to `/model opus` only for an Opus task in the table above, then switch back.
- **Subagents:** always pass `model` explicitly (`"sonnet"` or `"opus"`) on every Agent call. Never leave it out, because a missing value inherits the main session's model.
- **Forks:** `subagent_type: "fork"` always runs on the main session's model and ignores `model`. Use `general-purpose` with `model: "sonnet"` instead of a fork when the main session is on Opus.

Rules:
- I own collection. I wait for every agent, merge the worktrees, resolve conflicts and run the full checks before committing. No agent is fire-and-forget.
- Agents get the plan path, the CLAUDE.md rules and the exact files in scope. Builders never touch `theme.css`, migrations or `src/lib/domain/` at the same time; one owner per shared file.
- Small or sequential tasks (Phase 0 scaffold, the Phase 1 identity core) are done inline without agents, because spawning would cost more than it saves.

Per-screen loop: frontend-design spec, then mobile-native checklist, then ponytail TDD implementation, then Playwright MCP check against the canvas screenshot, then commit.

Playwright MCP is connected in this session. Its tools include navigate, click, fill_form, file_upload, snapshot, take_screenshot, console_messages, network_requests and resize.

## Phases (each ends green on lint, typecheck, test and coverage)

**Phase 0 — Foundation**
`git init`. `create-next-app` (latest stable, TS strict, App Router, Tailwind v4, ESLint). Add Vitest + Testing Library + jsdom (coverage thresholds of 80% on lines, branches and functions in `vitest.config.ts`) and Playwright. Then: `supabase init` with migration 0001 and the seed; `env.ts`; `theme.css` and fonts via `next/font/google` (Poppins, Pinyon Script, Cormorant Garamond) assigned to the CSS variables; ADRs; CLAUDE.md updates; a GitHub Actions CI running lint, typecheck, unit tests and build. Create the R2 bucket, CORS and custom domain.

**Phase 1 — Identity + Welcome** (TDD)
Tests first: `normalizeName` (trim, collapse spaces, 2–24 chars), `suggestNames` (skips taken names), the hashing util, cookie list max 5. Then `/api/guests`, `/api/session` (GET/DELETE) and the Welcome screen: monogram, input, inline error with suggestion chips, "Continue as X" chips, privacy note.

**Phase 2 — Wall (read)**
`GET /api/posts?cursor=` and `wall_counts`. Then the header (monogram, name chip, names, header message, memory count), WishTicker (4 s rotation, tap opens), sticky FilterBar with counts, PostCard (photo, album stack with badge, video with duration, wish with 5-line clamp, "You" badge), empty states, infinite scroll and Realtime.

**Phase 3 — Create**
FAB, then the speed-dial ActionMenu, then:
- WishDrawer: chips and the 0/300 counter. This is the simplest path and proves `/api/posts`.
- PhotoDrawer: up to 10 photos, preview grid, "will post as album" hint, progress.
- VideoDrawer: validation errors, poster, progress.
- The upload intent pipeline, rate limits and the cleanup endpoint.

**Phase 4 — View + own content**
`/p/[id]` viewer for photo, album and video. WishViewDrawer, MeDrawer (own posts, delete, Switch name), ConfirmDialog and Toast. Delete removes the R2 objects before the row.

**Phase 5 — QR + Admin**
QrDrawer (QR image, holder name, bank, Download QR, 3 steps). `/admin`: passcode, couple names and header message, QR upload (same presign flow), uploads open/closed (writes are refused when closed), hide/unhide/delete any post, zip download.

**Phase 6 — Hardening + launch**
Hourly cron sweep. Security review (security-reviewer agent): cookie flags, token never logged, RLS checked from an anon client, no service key in the client bundle (grep the `.next/static` output). Accessibility pass. Full `/mobile-native` audit of every screen. Playwright MCP regression walk of all 13 canvas screens in both themes. Wireframe theme check. Real iPhone Safari and Android Chrome tests including slow-3G upload. Deploy to Vercel and Supabase (prod), then set env vars and the cron. Load test: 30 phones posting at once.

---

## Testing (80% everywhere, TDD)

- **Unit** (`*.test.ts` next to the source): every domain function; `media.ts` with mocked canvas and video; the rate-limit check.
- **Component** (Testing Library): every drawer (validation, disabled states, counter), PostCard variants, FilterBar, BottomSheet focus and Escape, ConfirmDialog, WishTicker timer (fake timers).
- **Integration** (`tests/integration/`, local `supabase start`, R2 mocked with an in-memory S3 stub behind `r2.ts`):
  - name uniqueness, case-insensitive, under concurrency;
  - delete with someone else's token returns 403;
  - posting with a forged or expired intent is rejected;
  - the server derives the type, so a client-sent `type` is ignored;
  - rate limit at 31 posts;
  - anon client cannot read `token_hash` or hidden posts.
- **E2E**: explored and checked first with the Playwright MCP, then saved as `@playwright/test` specs that run in CI with mobile WebKit and Chromium profiles:
  1. join, taken name, suggestion, wall;
  2. post 3 photos, album card, gallery swipe, delete;
  3. post a wish, ticker, wish view, delete;
  4. admin hides a post and it disappears from a second browser context through Realtime.

## Verification

`npm run lint && npm run typecheck && npm run test -- --coverage` (fails below 80%), `npx playwright test`, `npm run build`. Then a manual run on `npm run dev` against local Supabase and an R2 dev bucket: walk through the canvas "howto" script (taken name "Ali", 3 photos becoming an album, open each card type, delete from the Me drawer, DuitNow QR) on a real iPhone and Android over the LAN.
