# 005 — Go + Gin backend, Next.js for the UI only

**Status:** accepted (2026-11-03); being built, see `docs/superpowers/plans/2026-11-03-go-gin-backend.md`

## Decision
The server side (`src/server`, `src/app/api`, `/qr`) moves to a Go service on Gin in `backend/`, with exactly the
same routes, responses, cookies and limits. Next.js keeps the pages and calls the Go API. The reverse proxy sends
`/api/*` and `/qr` to Go (`127.0.0.1:8080`) and everything else to Next.js (`127.0.0.1:3000`), so both stay on one
origin.

## Why
The user asked for a Go backend. One origin keeps the cookies, the cross-site guard and the same-origin `/qr`
download working without CORS.

## Consequences
- Two processes to run and deploy instead of one (`docs/DEPLOY.md` is updated in phase G7).
- JSON request bodies are capped at 1 MB (Next.js had no explicit cap); an oversized body is answered like invalid
  JSON (400 `invalid_input`).
- `NODE_ENV=production` still switches on `Secure` cookies and the `R2_ENDPOINT` guard, so both processes share one
  env file.
