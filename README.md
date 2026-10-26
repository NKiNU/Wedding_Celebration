# Wedding Memories

Mobile web app where wedding guests share photos, albums, videos and wishes on one shared wall. Next.js + Supabase (Postgres, Realtime) + Cloudflare R2 for media. See [CLAUDE.md](CLAUDE.md) for the rules and [docs/PLAN.md](docs/PLAN.md) for progress.

## Run it locally (Windows / macOS / Linux)

**Prerequisites:** Node 20+, Docker Desktop (running).

```bash
npm install
cp .env.example .env.local        # then fill it in, see below
npx supabase start                # starts Postgres, API, Realtime, Storage, Studio in Docker
npx supabase db reset             # migrations + seed (wipes local data)
npm run dev                       # http://localhost:3000
```

### `.env.local`

`npx supabase status` prints the values. The anon and service-role keys are the standard local-dev keys.

| Variable | Local value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | from `npx supabase status` |
| `ADMIN_PASSCODE`, `DEVICE_TOKEN_PEPPER`, `CRON_SECRET` | any random strings (pepper 32+, cron 16+ chars) |
| `EVENT_SLUG` | `demo` (matches the seed) |
| `R2_ENDPOINT` | `http://127.0.0.1:54321/storage/v1/s3` (local Supabase Storage stands in for R2) |
| `R2_REGION` | `local` |
| `R2_BUCKET` | `wedding` (declared in `supabase/config.toml`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | `S3_PROTOCOL_ACCESS_KEY_ID` / `..._SECRET` from `npx supabase status` |
| `R2_ACCOUNT_ID` | any value (unused locally) |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | `http://127.0.0.1:54321/storage/v1/object/public/wedding` |

If the bucket is missing after a reset, run `npx supabase seed buckets`.

For production media on Cloudflare R2 (bucket, token, CORS, custom domain), see [docs/R2-SETUP.md](docs/R2-SETUP.md).

### Local URLs

| What | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (browse tables and files) | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `127.0.0.1:54322`, db / user / password all `postgres` (DBeaver, psql) |

### Day to day

```bash
npx supabase start     # needs Docker Desktop running
npm run dev
npx supabase stop      # frees RAM; data is kept (use --no-backup to wipe)
```

Only the services the app uses are enabled in `supabase/config.toml` (auth, edge functions, analytics and the mail catcher are off). Schema changes go through `npx supabase migration new <name>`, never by hand.

## Checks

```bash
npm run lint
npm run typecheck
npm run test                      # vitest, fails below 80% coverage
npx playwright install chromium webkit   # once
npm run test:e2e                  # reset the DB first: the specs count the seed
E2E_UPLOADS=1 npm run test:e2e    # also runs the real upload test against local storage
```

## Testing on a phone

`npx next dev -H 0.0.0.0`, then open `http://<your-PC-LAN-IP>:3000` on the phone and allow port 3000 in the firewall. Cookies are `Secure`, so plain HTTP over a LAN IP may be rejected; use an HTTPS tunnel if joining fails.
