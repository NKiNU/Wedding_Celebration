# Plan: Go + Gin backend (feature parity with the Next.js server)

Status: **proposed (2026-11-03), nothing implemented.** Branch `claude/golang-gin-backend-plan-7qwqno`.

## Goal and scope

Rewrite everything the Next.js app does on the server (`src/server/**`, `src/app/api/**`, `src/app/qr/route.ts`)
as a Go service built on Gin. **Same features, no more, no less**: every route, status code, error code, message,
cookie, limit and database call stays as it is today. The guest and admin UI stays in Next.js and keeps its looks and
behaviour; it only stops importing `src/server/*` and calls the Go API instead.

What does **not** change:

- The Postgres schema and every migration in `supabase/migrations/` (0001 to 0007). Supabase CLI keeps owning them.
  The Go service calls the same security definer functions (`create_upload_intent`, `create_wish`,
  `create_post_from_intent`, `wall_counts`, `rate_limit_hit`, `admin_login_attempt`, `admin_login_clear`) and relies
  on their `PT4xx/PT5xx` codes exactly as the TypeScript does.
- Supabase Realtime. The browser still subscribes with the anon key to `posts` changes and the private
  `wall:<eventId>` topic; the `post_hidden` broadcast is sent by the database trigger, not by app code.
- R2 layout, keys, presign rules and the CDN `purge` placeholder (`docs/adr/001`, `docs/adr/003`, `docs/R2-SETUP.md`).
- One event per deployment, chosen by `EVENT_SLUG` (`docs/adr/002`).
- All CLAUDE.md **[rule]**s: name-only identity, token ownership, hashed tokens, server-derived post type, no
  money-gift data, PDPA minimum.

Out of scope: any new endpoint behaviour, new limits, new admin tools, the "ideas" listed under "Not fixed, on
purpose" in `docs/PLAN.md`. They stay ideas.

---

## Feature inventory (the parity checklist)

Every row below must exist in Go and pass the same tests. Source of truth in brackets.

### Guest API

| Method + path | Does | Success | Failures (code → status) |
|---|---|---|---|
| `POST /api/guests` `{name}` | Normalise + validate name, throttle `guest_join` per address, insert guest, set `wm_tokens` + `wm_active` [`identity.createGuest`, `rateLimit.throttle`] | 201 `{guestId, name}` | `invalid_input` 400, `rate_limited` 429, `name_taken` 409 + `details.suggestions` |
| `GET /api/session` | Guests this phone holds tokens for, and the active one [`getSession`] | 200 `{active, known[]}` | |
| `POST /api/session` `{guestId}` | "Continue as": activate only a guest whose token is in `wm_tokens` [`activateGuest`] | 200 `{guestId, name}` | `invalid_input` 400, `unknown_guest` 403 |
| `DELETE /api/session` | "Switch name": clear `wm_active` only [`clearActive`] | 200 `null` | |
| `GET /api/posts?cursor=` | Wall page of 24, keyset on `(created_at, id)`; first page also has `counts` and the 5 newest `wishes` [`wall.getWallPage`, `getWallCounts`, `getLatestWishes`] | 200 `{posts, nextCursor, counts, wishes}` | `invalid_cursor` 400 |
| `POST /api/posts` `{wishText}` | Wish through `create_wish` (hourly allowance) [`posts.createWish`] | 201 `{id}` | `no_session` 401, `uploads_closed` 403, `rate_limited` 429 |
| `POST /api/posts` `{postId, caption?}` | Media post from an upload intent: HEAD + 16-byte peek of every file, derive type, `create_post_from_intent`; idempotent on replay [`posts.createMediaPost`] | 201 `{id}` | `intent_not_found` 404, `intent_expired` 410, `upload_incomplete` 400, `invalid_media` 400, `uploads_closed` 403 |
| `DELETE /api/posts/:id` | Owner delete: files, purge, row, tombstone the intent [`posts.deletePost`] | 200 `null` | `post_not_found` 404, `not_yours` 403, `no_session` 401 |
| `GET /api/me/posts` | Active guest's newest 100 visible posts [`wall.getMyPosts`] | 200 `WallPost[]` | `no_session` 401 |
| `POST /api/uploads` `{files[]}` | Validate set (`uploadProblem`), `create_upload_intent` (quota + event storage cap), presign one PUT per file; drop the intent if presigning fails [`uploads.createUploadIntent`] | 201 `{postId, uploads[]}` | `uploads_closed` 403, `rate_limited` 429, `storage_full` 507 |
| `DELETE /api/uploads/:postId` | Cancel = atomic tombstone, best-effort object delete [`uploads.cancelUploadIntent`] | 200 `null` | `intent_not_found` 404, `already_posted` 409 |
| `GET /qr` | Stream the QR from the media domain on the app origin, 10 s timeout, `no-store`, `nosniff`, `inline; filename="duitnow-qr"` [`app/qr/route.ts`, `admin.getQrObject`] | 200 image | 404 text `No QR yet.` |
| `GET /api/cron/sweep` | Bearer `CRON_SECRET` (constant time); sweep 100 expired unconsumed intents; purge old `admin_attempts` and `rate_attempts` [`sweep.ts`] | 200 `{removed, failed}` | `unauthorized` 401 |

### Admin API (cookie `wm_admin`)

| Method + path | Does | Success | Failures |
|---|---|---|---|
| `POST /api/admin/session` `{passcode}` | Count attempt **before** comparing (`admin_login_attempt`, 5 / 15 min per hashed address), constant-time compare, clear on success, set signed cookie [`admin.login`] | 200 `null` | `rate_limited` 429, `wrong_passcode` 401 |
| `DELETE /api/admin/session` | Logout [`admin.logout`] | 200 `null` | |
| `PATCH /api/admin/event` | Partial update of names, header, QR holder + bank, uploads switch, three font keys; empty text clears optional fields [`admin.updateEvent`] | 200 `AdminEvent` | `not_admin` 401, `invalid_input` 400 |
| `POST /api/admin/qr` `{mime, bytes}` | Presign `events/{eventId}/admin/qr-{uuid}.{png\|jpg}` [`presignQr`] | 201 `{key, url}` | |
| `PUT /api/admin/qr` `{key}` | Key regex, HEAD, peek, size ≤ 2 MB, no header override; save; delete old file [`confirmQr`] | 200 `AdminEvent` | `invalid_key` 400, `upload_incomplete` 400 |
| `POST /api/admin/monogram` `{mime, bytes}` | Presign `monogram-{uuid}.{png\|webp\|svg}` [`presignMonogram`] | 201 `{key, url}` | |
| `PUT /api/admin/monogram` `{key}` | Same checks; SVG read in full (≤ 1 MB) and scanned (`svgBytesProblem`); a rejected upload is deleted unless it is the live key [`confirmMonogram`] | 200 `AdminEvent` | `invalid_key`, `upload_incomplete`, `unsafe_svg` (400) |
| `DELETE /api/admin/monogram` | Back to text initials, delete file [`removeMonogram`] | 200 `AdminEvent` | |
| `GET /api/admin/posts?cursor=` | Moderation page incl. hidden posts [`getModerationPage`] | 200 `{posts (+hidden), nextCursor}` | `invalid_cursor` 400 |
| `PATCH /api/admin/posts/:id` `{hidden}` | Hide / unhide (trigger broadcasts the hide) [`setHidden`] | 200 `null` | `post_not_found` 404 |
| `DELETE /api/admin/posts/:id` | Admin takedown, same `removePost` without owner check [`deletePostAsAdmin`] | 200 `null` | `post_not_found` 404 |
| `GET /api/admin/media` | Zip manifest `{url, name}[]`, 1000-row pages, safe folder names [`mediaManifest`] | 200 | |

Every admin route answers `not_admin` 401 without a valid cookie.

### Reads the Next.js pages do today without HTTP

The RSC pages and `ThemeStyle.tsx` call server functions directly. Once `src/server` is gone they need the same
data over HTTP. These are **not new features**: they expose, read-only, what the pages already read, and each one
is used only by the Next.js server, never shown as a new capability to guests.

| Path | Replaces | Used by |
|---|---|---|
| `GET /api/event` | `getEvent()` fields the pages render: couple names, header message, `uploadsOpen`, QR holder + bank + `hasQr`, font keys, monogram URL, `eventId` (Realtime topic). **Never** `qr_path` raw or anything else | `page.tsx`, `WallContent.tsx`, `ThemeStyle.tsx` |
| `GET /api/posts/:id` | `getPost(id)` (visible post or 404) | `p/[id]/page.tsx` |
| `GET /api/admin/event` | `getAdminEvent()` + `isAdmin()` (401 when not admin) | `admin/page.tsx` |

The wall page keeps rendering its first page from `GET /api/posts` (same data as `getWallPage(null)` +
`getWallCounts()` + `getLatestWishes()`).

### Cross-cutting behaviour to keep byte for byte

1. **Envelope** `{ok:true,data}` / `{ok:false,error:{code,message,details?}}`; `details` omitted when empty.
   Unknown failure: 500 `internal` "Something went wrong. Please try again." and a server log line.
2. **Cross-site guard** on every method except GET/HEAD: `Sec-Fetch-Site` must be `same-origin` or `none`; without
   it, an `Origin` must equal `<X-Forwarded-Proto or request scheme>://<Host>`; an unparsable Origin (`null`) is
   refused; no header at all passes (non-browser callers). 403 `forbidden` "Cross-site requests are not allowed."
3. **Validation errors**: 400 `invalid_input` with the **first** issue's message, fields checked in the zod schema's
   order. Custom messages copied verbatim (curly quotes included). A body that is not JSON is treated as `null`.
4. **String lengths** as JS measures them: names and wishes in code points (`[...s].length`), every other `max`
   (caption 120, groom/bride 40, header 120, holder 80, bank 60, passcode 200, key 200, mime 100) in **UTF-16 code
   units** (zod counts `.length`). Trim uses the JS whitespace set, not Go's `\s` (ASCII only).
5. **Names**: NFKC, strip `Cc`, `Cf` and `Default_Ignorable_Code_Point` (except tab, LF, CR), collapse JS whitespace,
   trim, 2–24 code points. Go's `unicode` package has no `Default_Ignorable_Code_Point` table: generate one from the
   Unicode `DerivedCoreProperties.txt` of the same version Node's ICU uses, and prove it with golden vectors.
   Suggestions: `"X 2"`, `"X & family"`, `"X 3"`, `"X 4"`, first two that fit and are not taken (prefix `ILIKE` with
   `\`, `%`, `_` escaped, limit 200; on lookup failure log and offer unchecked).
6. **Cookies**
   - `wm_tokens` (JSON array of raw tokens, max 5, newest last, oldest dropped) and `wm_active`: `HttpOnly`,
     `SameSite=Lax`, `Path=/`, `Max-Age=31536000`, `Secure` only when `NODE_ENV=production`.
   - `wm_admin` = `<unix expiry>.<base64url HMAC-SHA256(key = sha256("<ADMIN_PASSCODE>:<PEPPER>"), expiry)>`,
     `SameSite=Strict`, 24 h. Changing the passcode signs everyone out.
   - **Gotcha:** Next writes cookie values URL-encoded (`encodeURIComponent`). Go's `net/http` silently drops or
     quotes characters like `"` and `,` in a cookie value, which would break `wm_tokens`. Encode and decode with
     `url.QueryEscape`-compatible percent-encoding so cookies already on guests' phones keep working after cutover.
   - A tampered or oversized `wm_tokens` reads as an empty list.
7. **Tokens**: 32 random bytes, base64url without padding; stored as hex `sha256(token + DEVICE_TOKEN_PEPPER)`.
8. **Client address** for throttles: `X-Real-IP`, else the **last** `X-Forwarded-For` entry, else `unknown`. Do
   **not** use `gin.Context.ClientIP()` (different trust rules). Hash: hex `sha256("<bucket>:<PEPPER>")` where the
   bucket is the IPv4 address, or the first four groups of the expanded IPv6 address (leading zeros stripped,
   lowercase, `[]` and `%zone` removed, IPv4-mapped treated as IPv4). Same output as `bucketOf` so existing
   `rate_attempts` / `admin_attempts` rows keep counting across the cutover.
9. **Cursor**: base64url (no padding) of the JSON `["<created_at>","<id>"]`, where `created_at` is the text
   Postgres/PostgREST returns (`2026-10-25T10:00:00.123456+00:00`, microseconds kept). Select it as
   `to_json(created_at)#>>'{}'` so it is identical, and accept only the `TIMESTAMP` and UUID shapes in
   `domain/posts.ts`. Query with `(created_at, id) < ($1, $2)` (same index as today).
10. **JSON shapes** exactly as `src/lib/api.ts` and `src/lib/domain/posts.ts`: camelCase, `null` (not omitted) for
    nullable fields, `[]` (never `null`) for empty lists (`known`, `posts`, `media`, `uploads`), `durationS` a
    number, `author` falls back to `"Guest"`, media URLs `NEXT_PUBLIC_MEDIA_BASE_URL` without trailing slash + `/` +
    key, media ordered by `position`.
11. **Per-request event**: load the event row once per request (Next used React `cache`), never across requests, so
    admin edits show on the next load.
12. **Security headers** from `next.config.ts` on every Go response too: `Content-Security-Policy: frame-ancestors
    'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, `X-Frame-Options: DENY`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`,
    `Cross-Origin-Opener-Policy: same-origin`.
13. **Logging**: same events as the `console.error` calls (failed purge, failed tombstone, failed sweep item, …),
    through `log/slog`. Never log a token, the passcode, a cookie value or a presigned URL.
14. **Env** validated at start, fail fast listing the bad names, same rules as `parseEnv`: URLs, `ADMIN_PASSCODE`
    ≥ 8, `DEVICE_TOKEN_PEPPER` ≥ 32, `CRON_SECRET` ≥ 16, empty means unset, `R2_REGION` default `auto`,
    `GUEST_JOINS_PER_IP` / `MAX_EVENT_MB` positive integers ≤ 1 000 000 with defaults 300 / 9216, and
    `R2_ENDPOINT` refused under `NODE_ENV=production` unless loopback.

---

## Architecture

```
Browser (Safari iOS / Chrome Android)
  │
  ├──► Caddy (HTTPS, sets X-Real-IP / X-Forwarded-For / X-Forwarded-Proto)
  │       ├── /api/*, /qr  ──► Go + Gin  127.0.0.1:8080 ── pgx ── Supabase Postgres (service connection)
  │       │                                         └──── S3 SigV4 ── R2 (presign, HEAD, ranged GET, DELETE)
  │       └── everything else ──► Next.js 127.0.0.1:3000 (UI only; RSC fetches Go on 127.0.0.1:8080,
  │                                                         forwarding the Cookie header)
  ├──► R2 presigned PUT (direct from the phone, XHR progress)   — unchanged
  ├──► Media custom domain for reads                           — unchanged
  └──► Supabase Realtime with the anon key                     — unchanged
```

**Same origin is required**: the cookies, the cross-site guard and `/qr` (`<a download>`, `navigator.share`) all
depend on the API living on the app's own origin. So Caddy splits by path; there is no CORS on the Go service.

### Layout (`backend/`, its own Go module)

```
backend/
  cmd/server/main.go          # load env, build deps, gin.New(), graceful shutdown
  internal/
    domain/                   # pure, no I/O — port of src/lib/domain (names, tokens, limits, uploads, posts cursor, fonts)
    validation/               # request bodies + env (port of src/lib/validation.ts), ordered checks, zod-equal messages
    httpx/                    # AppError, envelope, Handle(), cross-site guard, security headers, body decode
    server/                   # services: env, db, event, identity, ip, ratelimit, uploads, posts, wall, admin, sweep
    r2/                       # R2 interface + SigV4 implementation (presign, head, peek, read, deleteMany, purge stub)
    routes/                   # gin handlers, one file per route group, < 30 lines each
  testdata/golden/            # JSON vectors exported from the TypeScript domain + validation
  go.mod
```

Layering mirrors the "Layering rules" table in `docs/PLAN.md`: `domain` imports nothing app-specific;
`validation` imports `domain`; `server` imports `domain`, `db`, `r2`; `routes` parse, authenticate, call one
service, map the result. Services depend on interfaces (`R2`, a `DB` querier, a clock) so tests swap fakes.

### Libraries (ponytail ladder: stdlib first)

| Need | Choice | Why |
|---|---|---|
| HTTP | `github.com/gin-gonic/gin` | Asked for. `gin.New()` (not `Default`), own recovery + slog logger, `HandleMethodNotAllowed = true`, `RedirectTrailingSlash = false` |
| Postgres | `github.com/jackc/pgx/v5` (`pgxpool`) | `*pgconn.PgError.Code` gives `23505` and `PT429/PT507/PT404/PT409/PT410/PT400` directly |
| S3 SigV4 | `github.com/aws/aws-sdk-go-v2/aws/signer/v4` + `net/http` | `PresignHTTP` on a hand-built PUT carrying `Content-Type` and `Content-Length`, so both land in `X-Amz-SignedHeaders`; plain signed requests for HEAD / ranged GET / DELETE, one retry, timeouts |
| Unicode | `golang.org/x/text/unicode/norm` + a generated range table | NFKC, Default_Ignorable |
| Concurrency | `golang.org/x/sync/errgroup` | the `Promise.all` spots (presign all, HEAD all, wall page + counts + wishes) |
| Validation | hand-written in `validation/` | zod's first-issue-in-schema-order semantics and messages are easier to match by hand than through struct tags |
| Crypto, JSON, cookies, logging | stdlib (`crypto/sha256`, `crypto/hmac`, `crypto/subtle`, `crypto/rand`, `encoding/json`, `net/http`, `log/slog`) | |
| Tests | stdlib `testing` + `net/http/httptest` | coverage gate at 80 % (CLAUDE.md) |

### Database access

- Connect with `DATABASE_URL` (Supabase session pooler or direct connection, as the `postgres` role, which bypasses
  RLS exactly like the service-role key does today). Transaction-mode pooler (port 6543) needs
  `default_query_exec_mode=simple_protocol` in pgx; prefer the session pooler.
- This replaces the backend's use of `SUPABASE_SERVICE_ROLE_KEY` (PostgREST). It is a config change, not a feature:
  record it in **ADR 004 "Go backend talks to Postgres directly"**. `NEXT_PUBLIC_SUPABASE_URL` and the anon key stay
  for the browser's Realtime.
- Every query keeps the explicit `event_id = $event` and `hidden = false` filters the TypeScript has (the service
  connection bypasses RLS, as before).
- Port each PostgREST call one to one, including the atomic ones: the cancel `UPDATE … WHERE consumed_at IS NULL AND
  cancelled_at IS NULL RETURNING files`, the delete-then-tombstone order, `setHidden … RETURNING id`.

---

## Phases

Each phase ends green on `go vet`, `staticcheck`, `go test -race -cover` (≥ 80 %), plus the checks named in the
phase, then a commit and a short session note at the top of `docs/PLAN.md`. TDD throughout: the failing test first.

**Phase G0 — Foundation**
- `backend/` module, Go 1.23+, `cmd/server`, gin wiring, slog, graceful shutdown, `/` 404.
- `env` port with tests for every rule in item 14.
- `httpx`: `AppError`, envelope, `Handle`, cross-site guard (port every case of `src/server/http.test.ts`), security
  headers, 1 MB request body cap (see "Decisions for the user").
- `scripts/export-golden.ts` (run with `npx tsx`): calls the real TypeScript `normalizeName`, `nameProblem`,
  `suggestNames`, `addToken`, `bucketOf`, `encodeCursor`/`decodeCursor`, `uploadProblem`, `derivePostType`,
  `mediaKey`, `qrKey`, `monogramKey`, `monogramMime`, `looksLike`, `svgBytesProblem`, `themeCss`/`fontOrDefault` and
  every zod schema on a large input set (edge cases from the existing `*.test.ts`, plus random and hostile strings)
  and writes `backend/testdata/golden/*.json`. Go tests must reproduce every output.
- CI: a `backend` job in `.github/workflows/ci.yml` (setup-go, vet, staticcheck, test with coverage gate, build).
- ADR 004 (Postgres direct) and ADR 005 (Go backend, Next.js UI only, same-origin path split).

**Phase G1 — Domain + validation (pure)**
- Port `src/lib/domain/*` and `src/lib/validation.ts` to `internal/domain` and `internal/validation`.
- Generated `Default_Ignorable_Code_Point` table; JS whitespace set; UTF-16 length helper.
- 100 % coverage here, golden vectors all green.

**Phase G2 — Identity + session + throttle**
- `db` (pgxpool, health check at start), `event` (per-request loader), `ip`, `ratelimit` (`rate_limit_hit`, fail
  closed), `identity` (create, session, activate, clear, `RequireGuest` middleware).
- Routes: `POST /api/guests`, `GET|POST|DELETE /api/session`, `GET /api/event`.
- Cookie compatibility test: a `wm_tokens` cookie written by the current Next.js app is read correctly by Go, and
  the other way round.

**Phase G3 — Wall (read)**
- `wall`: page, counts, latest wishes, single post, my posts; `to_json(created_at)` text for cursors.
- Routes: `GET /api/posts`, `GET /api/posts/:id`, `GET /api/me/posts`.
- Snapshot test: the JSON of a seeded wall from Go equals the JSON from the current Next.js route (same DB).

**Phase G4 — Create (uploads + posts)**
- `r2` package (presign, head with `overridden`, 16-byte ranged peek that refuses a non-206, bounded read,
  per-key delete accepting 404, `purge` stub) with a fake for unit tests.
- `uploads` (`createUploadIntent`, `cancelUploadIntent`), `posts` (`createWish`, `createMediaPost`).
- Routes: `POST /api/uploads`, `DELETE /api/uploads/:postId`, `POST /api/posts`.
- Proof against local Supabase Storage (S3 endpoint), as Phase 3 did: a PUT with a different size or type is refused
  (403), and the signed URL lists `content-length;content-type;host` in `X-Amz-SignedHeaders`.

**Phase G5 — Delete + admin + QR + cron**
- `removePost` (files → purge → row → tombstone), `DELETE /api/posts/:id`.
- `admin`: login / logout / `RequireAdmin`, event update, QR presign + confirm, monogram presign + confirm + remove,
  moderation page, hide / unhide, admin delete, media manifest. Routes under `/api/admin/*`, `GET /api/admin/event`.
- `GET /qr` streaming with the 10 s timeout and headers.
- `sweep` + `GET /api/cron/sweep`.

**Phase G6 — Frontend cut-over**
- Replace every `@/server/*` import in `src/app/**` with a small `src/lib/backend.ts` (server-only `fetch` to
  `BACKEND_URL`, default `http://127.0.0.1:8080`, forwarding the request's `Cookie` header and the
  `X-Forwarded-*` headers, `cache: "no-store"`). Pages render the same props as today. Client code already calls
  `/api/*` through `src/lib/api.ts` and needs no change.
- Delete `src/app/api/**`, `src/app/qr/route.ts`, `src/server/**` and their tests; drop `aws4fetch` and
  `@supabase/supabase-js` server use. Keep `src/lib/domain` (the UI uses it for early checks and labels) and the
  zod schemas the UI uses (`nextParam`, …).
- `next dev` proxies `/api/*` and `/qr` to the Go server in development (`rewrites` in `next.config.ts`, dev only),
  so the existing Playwright `webServer` setup still works with one extra process.
- `scripts/check-bundle.mjs` keeps running (the browser bundle must still hold no secret).
- Update `CLAUDE.md` (Stack, Commands, Folder structure, env list) **only with the user's yes**, since it changes the
  documented stack.

**Phase G7 — Parity proof, hardening, deploy**
- Run the existing black-box suites against Go:
  `SUPABASE_INTEGRATION=1 INTEGRATION_BASE_URL=http://localhost:3000 npx vitest run tests/integration` (uploads,
  delete, rls, load) and the full `npx playwright test` incl. `--project=admin` on a freshly reset database. These
  were written against the Next.js routes, so passing them unchanged is the parity proof.
- Security review of the Go code (cookies, token handling, cross-site guard, presign scope, constant-time compares,
  address trust, SVG scan, no secrets in logs).
- `docs/DEPLOY.md`: Go binary under systemd bound to 127.0.0.1:8080, Caddy path split, env file, cron line
  unchanged (same URL). Launch checklist from `docs/PLAN.md` still applies.

---

## Testing (80 % floor)

- **Unit** (`*_test.go` next to the code): every domain and validation function against the golden vectors; every
  service with a fake DB querier, fake R2 and fixed clock, ported from the matching `src/server/*.test.ts` case by
  case (the TS tests are the spec: same names, same expectations).
- **HTTP** (`httptest` + gin): every route's status, envelope, cookie attributes and the cross-site guard.
- **Integration** (`-tags integration`, local `supabase start`): name uniqueness under concurrency, 31st post 429,
  42 parallel intents → exactly 30 × 201, forged / expired intent, client `type` ignored, delete by another token
  403, storage cap 507, admin login burst lets exactly 5 of 8 through.
- **Black box**: the existing `tests/integration/*.test.ts` and `tests/e2e/*.spec.ts`, unchanged, against
  Next.js UI + Go API (Phase G7).
- Coverage gate: `go test ./... -coverprofile=cover.out` and a check that fails below 80 % (CI and `make test`).

---

## Working method: skills and agents for this work

The skills in `.claude/skills/` are almost all about UI and motion. The Go backend has no UI, so most of them do
not apply. This is the mapping:

| Skill / tool | Use here | When |
|---|---|---|
| `/security-review` | **Yes** | End of G2 (identity, cookies), G4 (uploads, presign), G5 (admin, QR, SVG, cron) and the full G7 audit. Opus, per the model policy |
| `/code-review` | **Yes** | End of every phase, before the commit: correctness against this plan's parity table and the layering rules |
| `/simplify` | **Yes** | After G5 and after G6: reuse, dead code left by the cut-over |
| `/run` | **Yes** | G6 and G7: start Supabase, the Go server and `next dev` together and drive the app |
| Playwright (`@playwright/test`, and the Playwright MCP when connected) | **Yes** | G6 and G7: the existing specs at 390 × 844 and 412 × 915; a walk of the canvas "howto" script |
| `mobile-native` | **Only in G7** | Re-check on real iPhone Safari and Android Chrome what the backend now controls: `Secure` cookies through the proxy, Download QR from `/qr` (share sheet, `<a download>`), old iPhone without `Sec-Fetch-Site` joining and posting |
| `mobile-app-ui-design`, `apple-design`, `emil-design-eng`, `animate`, `animate-expo`, `animation-vocabulary`, `improve-animations`, `review-animations`, `find-animation-opportunities`, `pick-ui-library`, `prototype`, `ask-sonner` | **No** | No screen, motion or component changes in this plan. If one sneaks in, it is out of scope |
| `write-swift` | **No** | Not a Swift project |
| `verify` (`.claude/skills/verify`) | **No** | It describes a different project ("prod-learn" LMS QA harness), not this app. Do not follow it here; use `/run` |
| `db-model-reviewer` agent (`.claude/agents/`) | **No** | It reviews a Mongoose model for another project. The schema here is Postgres and does not change |
| `/ponytail` | **Yes** | Start of every coding task (G0 to G6): the ladder in "Libraries" comes from it. Mark deliberate shortcuts with a `ponytail:` comment, as the TypeScript does (the skill now writes `shortcut:`; both are read by `/ponytail-debt`). It never removes validation, security or the 80 % coverage rule |
| `/ponytail-review` | **Yes** | Alongside `/code-review` at the end of each phase: is every line of the port needed |
| `/ponytail-debt` | **Yes** | Before G7: list every `ponytail:` / `shortcut:` marker so each TypeScript shortcut is either ported with its comment or closed |
| `/ponytail-audit`, `/ponytail-help`, `/ponytail-gain` | Optional | `audit` once after G6 on `backend/`; the other two are reference cards |

Also referenced by `docs/PLAN.md` but missing from `.claude/agents/`: `code-reviewer`, `security-reviewer`,
`tdd-guide`, `e2e-runner`. Use the `/code-review` and `/security-review` skills in their place, and `Explore` /
`Plan` / `general-purpose` agents as `docs/PLAN.md` "Subagents" describes.

Model policy from `docs/PLAN.md` holds: never Haiku; Sonnet by default (porting, routes, tests, docs); Opus for the
security reviews, the presign / upload-intent port (G4) and the Postgres access layer (G2). The ponytail skills live in `.claude/skills/ponytail*` (added on `main` in PR #5, from `DietrichGebert/ponytail`, MIT, skill files only, no hooks).

Parallel builders only
on files that do not overlap (for example `admin` QR and monogram vs `sweep` in G5); one owner for `domain/` and
`validation/`.

---

## Decisions for the user (before G0)

1. **`DATABASE_URL` + pgx** instead of PostgREST with the service-role key (recommended: direct SQL, real
   transactions, error codes without a translation layer). The alternative keeps the current env vars but needs a
   hand-rolled PostgREST client in Go.
2. **1 MB request body cap** on the Go JSON routes. Next.js route handlers have no explicit cap; Go reads whatever it
   is sent, so a cap is the safe default. No real request is near 1 MB (the largest is 20 file descriptors). Say no
   and it is left out.
3. **`NODE_ENV=production`** is kept as the switch for `Secure` cookies and the `R2_ENDPOINT` guard, so the env file
   stays the same for both processes.
4. **CLAUDE.md** changes in G6 (stack, commands, folders, env) need your yes, as the file asks.

## Risks

- **Unicode parity** (NFKC version, Default_Ignorable table, `toLowerCase` vs Go `strings.ToLower` for the taken-name
  set). Mitigated by the golden vectors; the unique index on `lower(name)` in Postgres stays the real guard.
- **Cookie encoding** at cutover: guests who joined before the switch must keep their names. Tested in G2.
- **Presigned header signing**: if a library drops `Content-Length` from the signed headers, R2 would accept any
  size. The G4 proof against a real S3 endpoint is required, not optional.
- **Two processes** to run and deploy instead of one. Covered in `docs/DEPLOY.md` (G7).
