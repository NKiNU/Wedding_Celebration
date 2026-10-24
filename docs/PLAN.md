# Wedding Memories — Development Plan

## Progress (update at the end of every session)

- [x] Phase 0 — Foundation (carry-overs below)
- [ ] Phase 1 — Identity + Welcome
- [ ] Phase 2 — Wall (read)
- [ ] Phase 3 — Create
- [ ] Phase 4 — View + own content
- [ ] Phase 5 — QR + Admin
- [ ] Phase 6 — Hardening + launch

Last session notes (2026-10-25, Phase 0):
- **Built:**
  - Next 16 + Tailwind v4 scaffold. The folder `Wedding` has capitals, so it was scaffolded in a temp dir and copied in; the package is `wedding-memories` and Node must be >= 22.12.
  - Vitest: the 80% gate is part of `npm test`, RTL cleanup is in `tests/setup.ts`, and shared env fixtures are in `tests/fixtures/`.
  - Playwright with iPhone 14 and Pixel 7 projects; the smoke spec passes on both.
  - `theme.css`: default and wireframe tokens, `@theme inline reference` (avoids the self-referencing vars), and the mobile baseline in `@layer base`. Page overscroll is left on so guests can pull to refresh.
  - Fonts and viewport in `layout.tsx`.
  - Env validation in `validation.ts` and `server/env.ts`. `ADMIN_PASSCODE` must be at least 8 characters.
  - `domain/limits.ts`.
  - ESLint token rule covering strings and template literals in `src/components` and `src/app` (except `layout.tsx`).
  - CI workflow, `supabase init`, ADRs 001–003, CLAUDE.md updates.
- **DB:**
  - `0001_init.sql` and `seed.sql` were written by an Opus subagent and reviewed on Opus.
  - The default grants for future objects are revoked to anon, so each new table or function must grant explicitly.
  - Verified on PGlite with a Supabase role stub covering RLS, grants, checks, the intent function, the hide broadcast and the query plans. Not yet verified on real Supabase.
- **Checks:** lint, typecheck, test (100% of 3 files) and build are all green.
- **Carry-overs (do at the start of Phase 1):**
  1. Restart Docker Desktop; it hung when the disk filled. Then run `npx supabase start`, `npx supabase db reset`, repeat the anon checks with psql, run `npx supabase gen types typescript --local > src/lib/database.types.ts`, then `npx supabase stop`.
  2. R2 bucket, CORS and custom domain (the user does this).
- **Deferred review items:**
  - Per-file `// @vitest-environment node` for server tests that touch crypto or fetch.
  - E2E is not in CI yet; it is added when there are flows.
  - The rate limit counts posts that exist, so deleting frees quota. Move the check to intent issuance if that is abused.
- **Housekeeping:**
  - C: ran out of space. The npm cache was cleared with the user's OK.
  - `.claude/`, `.agents/` and `skills-lock.json` (user-installed skills) are left untracked; the user decides whether to commit them.
  - A stray `C:\Users\acer\package-lock.json` exists. `turbopack.root` is pinned, so it is harmless.

Blocked on the user: Docker Desktop running (local Supabase); Cloudflare R2 bucket, API token and media custom domain (develop against the in-memory R2 stub until then); production Supabase project (needed at launch only).

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
| Code | `/ponytail:ponytail` | Invoked at the start of every coding task. Follow its ladder: does the code need to exist, then is it already in the repo, then stdlib, then a native platform feature, then an installed dependency, then the minimum code. Mark deliberate shortcuts with `ponytail:` comments. Ponytail never removes validation, security, accessibility or the 80% coverage rule. |
| E2E testing | Playwright MCP (`mcp__plugin_playwright_playwright__*`) | Every phase ends with an MCP-driven pass on the running `npm run dev` app at phone viewports (390×844 iPhone, 412×915 Android). Steps: navigate, fill and click through the flow, check the accessibility snapshot, read console and network errors, and take screenshots to compare with the canvas screens. Flows that pass are then written as `@playwright/test` specs so CI can repeat them, because the MCP cannot run in CI. |

### Subagents

Only these agent types exist: `Explore`, `Plan`, `general-purpose`, `fork`, and the project's `db-model-reviewer`. The global rules name `code-reviewer`, `security-reviewer`, `tdd-guide` and `e2e-runner`, but there is no `~/.claude/agents/` folder. Those roles therefore run as `general-purpose` agents with a role prompt. `db-model-reviewer` is built for Mongoose, so it is not used here.

| Role | Agent type | Model | When | Runs |
|---|---|---|---|---|
| Codebase lookup | `Explore` | `sonnet` | Before changing an area that is new to the session ("where is X used", "is there already a helper for Y") | Foreground, read-only |
| Phase planning | `Plan` | `opus` | Start of Phases 2 to 5: break the phase into tasks against the real code | Foreground, read-only |
| Parallel builders | `general-purpose` with `isolation: "worktree"` | `sonnet` | Tasks in a phase that do not share files, for example each of the three drawers in Phase 3, or the admin pages alongside the QR drawer in Phase 5. Each builder follows the per-screen loop and ponytail, and returns a diff summary | Background, in parallel (max 3) |
| Test writer (TDD) | `general-purpose`, role prompt "tdd-guide" | `sonnet` | Writes failing tests from the spec before the builder implements, for domain rules, route handlers and components | Foreground, before the build |
| Code review | `general-purpose`, role prompt "code-reviewer" | `sonnet` | After each phase's code is in, before commit: correctness, the layering rules, the ponytail checklist, coverage gaps | Background, run alongside the security review |
| Security review | `general-purpose`, role prompt "security-reviewer" | `opus` | After Phases 1, 3, 4 and 5 (identity, uploads, delete, admin), and the full Phase 6 audit: token handling, cookies, RLS, presign scope, secrets in the bundle | Background, run alongside the code review |
| E2E runner | `general-purpose` with Playwright MCP | `sonnet` | End of each phase: walks the flows at phone viewports against the dev server, compares them with canvas screenshots, and reports failures with screenshots | Background, while I fix review findings |

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
- Optional: I can create real agent files (`code-reviewer.md`, `security-reviewer.md`, `tdd-guide.md`, `e2e-runner.md`) in `.claude/agents/` so the role prompts are fixed and reusable.

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
