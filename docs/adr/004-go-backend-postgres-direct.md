# 004 — The Go backend talks to Postgres directly

**Status:** accepted (2026-11-03, Go backend plan G0)

## Decision
The Go service connects to Supabase Postgres with `pgx` through `DATABASE_URL` (the session pooler or the direct
connection, as the `postgres` role), not to PostgREST with `SUPABASE_SERVICE_ROLE_KEY`.

## Why
Real SQL and transactions, and the `PTxxx` / `23505` codes of the migrations' functions arrive as `pgconn.PgError.Code`
with no translation layer. A PostgREST client would have to be written by hand in Go.

## Consequences
- New env var `DATABASE_URL` for the backend. `SUPABASE_SERVICE_ROLE_KEY` is no longer read by the backend;
  `NEXT_PUBLIC_SUPABASE_URL` and the anon key stay for the browser's Realtime.
- The `postgres` role bypasses RLS like the service role did, so every query keeps its explicit `event_id` and
  `hidden = false` filters.
- The transaction pooler (port 6543) needs `default_query_exec_mode=simple_protocol`; prefer the session pooler.
- The schema and migrations do not change.
