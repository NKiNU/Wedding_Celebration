# 003 — Upload intents

**Status:** accepted (Phase 0); amended in Phase 3 (TTL, rate limit, DELETE guard)

## Decision
Uploads are two-step and never trust client paths or type.

1. `POST /api/uploads` checks limits and rate limits, creates `postId` and an `upload_intents` row (60 min TTL), returns presigned PUT URLs that expire after 15 min. The URL signs the exact `Content-Type` and `Content-Length`.
2. Client uploads to R2 directly.
3. `POST /api/posts { postId, ... }` loads the intent (must belong to the active guest, unconsumed), `HEAD`s each key to verify size and type, derives `type` on the server, inserts `posts` + `post_media` in one transaction and marks the intent consumed.
4. On failure the client calls `DELETE /api/uploads/{postId}`, which refuses (409) once the intent is consumed so a live post never loses its files; an hourly cron (`/api/cron/sweep`, guarded by `CRON_SECRET`) deletes objects of expired, unconsumed intents.

## Rate limit
Counted from upload intents, not from posts: an intent whose `expires_at` is in the future was created in the last hour (TTL = window), whether or not it became a post. In-flight uploads therefore count, and deleting a post does not free quota. Wishes are counted from `posts` (`type = 'wish'`, last hour). The limit is per guest; a phone that creates new names is only capped by the Phase 6 guest cap.

## Why
A forged or replayed request cannot attach arbitrary keys to a post, and orphaned files are always cleaned up.

## Consequences
A 60 min TTL covers a 100 MB video on slow 3G (R2 checks the URL expiry when the request starts). Single PUT, no resume (`ponytail:` upgrade to presigned multipart if venue reports show failed large videos).
