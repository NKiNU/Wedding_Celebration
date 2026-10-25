# Wedding Memories — Development Plan

## Progress (update at the end of every session)

- [x] Phase 0 — Foundation (carry-overs below)
- [x] Phase 1 — Identity + Welcome
- [x] Phase 2 — Wall (read)
- [x] Phase 3 — Create
- [x] Phase 4 — View + own content
- [ ] Phase 5 — QR + Admin
- [ ] Phase 6 — Hardening + launch

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
- **Reviews:** security (Opus): no CRITICAL or HIGH; the MEDIUM (a replayed presigned PUT could re-create a deleted post's files with nothing to clean them up) is fixed with the tombstone. Code review (Sonnet): the HIGH (wish quota refunded by delete) is fixed with migration 0003; also fixed: focus order after a confirm, `MeDrawer` calling the API (now `useSwitchName`), arrows hiding under focus, a refresh error hidden behind a stale list, `tabindex` on a one-photo track, a dark Suspense fallback, integration tests for delete. **Not fixed, on purpose:** `useWall.refresh` does not filter ids in `removed` (it would block an admin unhide in Phase 5; a stale response at worst flickers a deleted post until the DELETE event); "Back" can leave the app when a link was opened from another site in the same tab (`history.length` cannot tell); a shared `/p/<id>` link loses its target after joining (no `next` parameter); a wish link redirects to `/wall` without opening its drawer; deleted media may live in the CDN cache until Phase 6 sets `Cache-Control` / purges; a non-owner gets 403 (not 404) for a hidden post's id.
- **Needs a real phone (Phase 6):** the "Post deleted" toast is announced by a live region outside an open modal, which screen readers may skip (check VoiceOver and TalkBack; if silent, announce from inside the dialog); the album swipe feel and the thumbnail strip on a real iPhone; a MOV/HEVC video on Android Chrome (the player shows "can't be played on this phone" on error).
- **Carry-overs left for Phase 5 and 6:** unchanged from the Phase 3 list below.

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
  - Dev-only `R2_ENDPOINT` / `R2_REGION` point the same adapter at local Supabase Storage (S3 API, public bucket `wedding`), so browser and integration runs exercise real signed PUTs. `R2_ENDPOINT` is refused when `VERCEL_ENV=production`; empty values mean unset.
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
5. On failure, the client calls `DELETE /api/uploads/{postId}`. A safety net: a Vercel Cron job (`/api/cron/sweep`, guarded by `CRON_SECRET`, hourly) deletes R2 objects of expired, unconsumed intents.

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
