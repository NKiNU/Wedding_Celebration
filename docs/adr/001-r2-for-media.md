# 001 — Media on Cloudflare R2

**Status:** accepted (Phase 0)

## Decision
Photos, videos, posters, thumbnails and the DuitNow QR are stored in Cloudflare R2, not Supabase Storage. Supabase stays for Postgres and Realtime.

- Browser uploads with a presigned `PUT` (signed with exact `Content-Length` and `Content-Type`).
- Reads use a public custom domain (`NEXT_PUBLIC_MEDIA_BASE_URL`), unguessable UUID keys.
- Keys: `events/{eventId}/{postId}/{position}.{ext}`, plus `{position}_thumb.jpg` and `{position}_poster.jpg`. QR: `events/{eventId}/admin/qr-{uuid}.{ext}`.
- Server uses `aws4fetch` for presign, `HEAD` and `DeleteObjects`. Bucket CORS allows `PUT` from the app origin.
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_MEDIA_BASE_URL`.

## Why
Egress-free reads for a media-heavy, one-day, many-viewer event, and lower storage cost.

## Consequences
`post_media` gains `thumb_path`, `bytes`, `mime`. Until the bucket exists, development uses an in-memory R2 stub behind `src/server/r2.ts`.
