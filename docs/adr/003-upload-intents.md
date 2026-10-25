# 003 — Upload intents

**Status:** accepted (Phase 0); amended in Phase 3 (TTL, rate limit, DELETE guard)

## Decision
Uploads are two-step and never trust client paths or type.

1. `POST /api/uploads` checks limits and rate limits, creates `postId` and an `upload_intents` row (60 min TTL), returns presigned PUT URLs that expire after 15 min. The URL signs the exact `Content-Type` and `Content-Length`.
2. Client uploads to R2 directly.
3. `POST /api/posts { postId, ... }` loads the intent (must belong to the active guest, unconsumed), `HEAD`s each key to verify size and type, derives `type` on the server, inserts `posts` + `post_media` in one transaction and marks the intent consumed.
4. On failure the client calls `DELETE /api/uploads/{postId}`, which refuses (409) once the intent is consumed so a live post never loses its files; the hourly sweep (below) is the backstop.

## Rate limit
Counted from upload intents, not from posts: an intent whose `expires_at` is in the future was created in the last hour (TTL = window), whether or not it became a post or was cancelled. In-flight uploads therefore count, and neither a cancel nor a delete frees quota. Wishes have no intent and are counted from `posts` (`type = 'wish'`, last hour).

The check and the spend are one database call (`create_upload_intent`, `create_wish`, migration 0002) that takes `pg_advisory_xact_lock(hashtext(guest_id))` first, so 50 parallel requests cannot all see an empty allowance. The limits are passed in from `limits.ts`, so they stay in one place. The limit is per guest; a phone that creates new names is only capped by the Phase 6 guest cap.

## Cancel and sweep
`DELETE /api/uploads/{postId}` sets `cancelled_at` with one atomic update that only matches an unconsumed row. The row stays as a tombstone: it keeps counting against the hour, and `create_post_from_intent` raises `PT410` for it. The objects are deleted at once, best effort, but a presigned URL (15 min) could re-create them, so `GET /api/cron/sweep` (hourly, `Authorization: Bearer $CRON_SECRET`) deletes the objects and the row of every unconsumed intent whose `expires_at` has passed. By then no URL is alive, so nothing can come back.

## Verifying what was uploaded
Before posting, every file is checked in R2: exact size and type (`HEAD`), no `Content-Disposition` / `Content-Encoding` (unsigned headers are stored and served back), and its first 16 bytes (ranged `GET`) must look like its declared type, so an arbitrary file cannot be served as a photo or video.

## Why
A forged or replayed request cannot attach arbitrary keys to a post, and orphaned files are always cleaned up.

## Consequences
A 60 min TTL covers a 100 MB video on slow 3G (R2 checks the URL expiry when the request starts). Single PUT, no resume (`ponytail:` upgrade to presigned multipart if venue reports show failed large videos).
