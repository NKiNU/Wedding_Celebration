# Wedding Memories

A mobile web app where wedding guests share photos, albums, videos and wishes on one live wall, and
find the couple's DuitNow QR for a money gift. Guests join with a name only. Built for Safari (iOS)
and Chrome (Android). Next.js (App Router), Supabase (Postgres + Realtime), Cloudflare R2 for media.

- **Rules and conventions:** [`CLAUDE.md`](./CLAUDE.md)
- **Plan, progress and session notes:** [`docs/PLAN.md`](./docs/PLAN.md)
- **Decisions:** [`docs/adr/`](./docs/adr)
- **Deploying (VPS, Supabase, cron, launch checklist):** [`docs/DEPLOY.md`](./docs/DEPLOY.md)
- **R2 bucket, CORS, media domain, cache purge:** [`docs/R2-SETUP.md`](./docs/R2-SETUP.md)

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill it in; see CLAUDE.md for each variable
npx supabase start                # local Postgres + Realtime + S3-compatible storage (Docker)
npx supabase db reset             # migrations + demo seed
npm run dev                       # http://localhost:3000
```

For media without an R2 bucket, point `R2_*` at local Supabase Storage and create the public bucket
(`docs/adr/001-r2-for-media.md`, "Consequences"; `docs/PLAN.md`, "Local setup").

## Checks

```bash
npm run lint
npm run typecheck
npm test                  # unit + component, fails below 80% coverage
npm run build && npm run check:bundle   # no secret or server-only name in the browser bundle
npm run test:e2e          # Playwright, iPhone Safari + Android Chrome profiles
SUPABASE_INTEGRATION=1 npx vitest run tests/integration   # real stack: uploads, delete, anon access, 30-phone burst
```
