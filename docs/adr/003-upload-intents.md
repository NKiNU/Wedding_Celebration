# 003 — Upload intents

**Status:** accepted (Phase 0, implemented in Phase 3)

## Decision
Uploads are two-step and never trust client paths or type.

1. `POST /api/uploads` checks limits and rate limits, creates `postId` and an `upload_intents` row (15 min TTL), returns presigned PUT URLs.
2. Client uploads to R2 directly.
3. `POST /api/posts { postId, ... }` loads the intent (must belong to the active guest, unconsumed), `HEAD`s each key to verify size and type, derives `type` on the server, inserts `posts` + `post_media` in one transaction and marks the intent consumed.
4. On failure the client calls `DELETE /api/uploads/{postId}`; an hourly cron (`/api/cron/sweep`, guarded by `CRON_SECRET`) deletes objects of expired, unconsumed intents.

## Why
A forged or replayed request cannot attach arbitrary keys to a post, and orphaned files are always cleaned up.

## Consequences
Single PUT, no resume (`ponytail:` upgrade to presigned multipart if venue reports show failed large videos).
