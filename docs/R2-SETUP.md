# R2 handoff: what the bucket, token and media domain must do

The app side is finished and tested against an S3-compatible stand-in (local Supabase Storage).
Setting up the real Cloudflare R2 bucket is a separate job. This page is its checklist: what to
create, what the app expects, and how to prove it works. Nothing here needs a code change except
the cache purge, which is a marked placeholder.

The only file that talks to R2 is `src/server/r2.ts` (`presignPut`, `head`, `peek`, `deleteMany`,
`purge`). Decision record: `docs/adr/001-r2-for-media.md`.

## 1. Create

1. **Bucket** (one per deployment), no public bucket access through the `r2.dev` URL.
2. **API token**, scoped to that one bucket, permission **Object Read & Write** (not Admin). Its
   Access Key ID and Secret go in `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`; the bucket name in
   `R2_BUCKET`; the account id in `R2_ACCOUNT_ID`. Leave `R2_ENDPOINT` and `R2_REGION` empty.
3. **Custom domain** on the bucket (e.g. `media.example.com`) for public reads, on the same
   Cloudflare zone so the rules below apply. Put it in `NEXT_PUBLIC_MEDIA_BASE_URL` (no trailing
   slash) and **rebuild**: it is baked in at build time.

## 2. Bucket CORS

Browsers PUT straight to `https://<account>.r2.cloudflarestorage.com/<bucket>/...`, and the admin
zip download reads from the media domain, so the app origin needs both:

```json
[
  {
    "AllowedOrigins": ["https://wedding.example.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Only the real app origin, never `*`. If the media domain is served through a Cloudflare rule rather
than the bucket CORS, add the same `Access-Control-Allow-Origin` there for `GET`/`HEAD`.
Without the `GET` rule "Download zip" fails with "Check that the media domain allows downloads".

## 3. Response headers on the media domain

Add a Transform Rule (Modify Response Header) on the media hostname:

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | A guest-uploaded file can never be re-interpreted as a page or script. |
| `Content-Security-Policy` | `default-src 'none'; sandbox` | Same reason, for anything opened directly by URL. |
| `Cache-Control` | `public, max-age=3600` | Keys are unguessable and never overwritten. Raise to `public, max-age=31536000, immutable` **only after the purge below works**; until then a deleted photo can live in the cache for this long. |

Remove `Content-Disposition` and `Content-Encoding` from responses. The app already refuses to post an
object that carries either (the uploader can set them: unsigned headers are stored and served back), so
this is a second lock, and it is **required**, not optional.

**Edge cache TTL must not come from the object.** An uploader can also store a `Cache-Control` on their
file (the app does not check it: local storage adds one of its own). A Transform Rule changes what the visitor
sees, not how long the CDN keeps the file. Add a **Cache Rule** on the media hostname with an *Edge Cache TTL* of
at most an hour, set to override the origin, so a guest cannot make a deleted photo live a year at the edge.

## 4. Purge on delete (the placeholder)

`purge(keys)` in `src/server/r2.ts` is an empty function. `removePost` calls it right after the files
are deleted, logs a failure and carries on, so a deleted post is gone from the app either way.
Replace the body with the CDN's purge-by-URL call for `${NEXT_PUBLIC_MEDIA_BASE_URL}/${key}` for each
key. With Cloudflare: `POST https://api.cloudflare.com/client/v4/zones/<zone>/purge_cache` with
`{"files": [urls]}` and a token that has **Cache Purge**, up to 30 URLs per call (a post has at most
20 keys). Add the zone id and token to `src/lib/validation.ts` (env schema), `.env.example` and the
deploy env file, and extend the unit test in `src/server/r2.test.ts` (it currently asserts "no
request").

Skipping this is acceptable if the cache TTL stays at an hour or less and a deleted photo reachable
by its exact URL for that long is fine for the couple.

## 5. Proof (run these before the event; the app's own tests cannot)

Use a throwaway key under `events/<event id>/test/`. `<PUT URL>` is a presigned URL: take it from the
`uploads[].url` of `POST /api/uploads` in the browser's network tab, or run
`SUPABASE_INTEGRATION=1 npx vitest run tests/integration/uploads.test.ts` with `.env.local` pointed
at the bucket (it exercises every case below through the real app).

- [ ] A PUT with the declared size and type succeeds (200).
- [ ] A PUT with a different `Content-Length` or `Content-Type` than was signed is refused (403). The
      signature covers both; local storage and R2 must both enforce it.
- [ ] A PUT that adds `Content-Disposition` or `Content-Encoding` is accepted by storage but the
      following `POST /api/posts` is refused (400 `upload_incomplete`); the browser's cleanup call or the hourly sweep then removes the file.
- [ ] `curl -s -r 0-15 -o /dev/null -w '%{http_code}' <media url>` is `206` (the app peeks at the
      first bytes of every upload with a ranged GET and treats `200` as an error).
- [ ] `curl -sI <media url>` shows the headers from section 3.
- [ ] From the app origin in a browser console, `fetch(<media url>)` succeeds; from another origin it
      is blocked.
- [ ] An expired presigned URL (wait 15 minutes) is refused.
- [ ] Delete a post, then `curl -sI <exact media url>` is `404` immediately and stays `404` from a
      second network (the purge, if wired).
- [ ] `GET /api/cron/sweep` with the bearer secret removes objects of an upload that was never posted.

## 6. Still open (decide, don't assume)

- **Conditional PUT.** The owner of an upload can overwrite a file with a second PUT until the URL
  expires (15 minutes), including after the post exists. `If-None-Match: *` signed and sent with
  the PUT would stop it if R2 supports it. Confirm in the dashboard or by test first; then
  `presignPut` signs the header, `putFile` in `src/lib/upload.ts` sends it and treats `412` as done,
  and the CORS `AllowedHeaders` gains `if-none-match`. The risk today is a guest replacing their
  own photo with another file of the same size and type: low, and the file is still bound to their
  post.
- **Video limit.** The 60 second limit is enforced in the browser only; the 100 MB cap is what the
  server enforces.
- **Lifecycle.** An unconfirmed QR upload from the admin is never swept (one small file at most).
  A lifecycle rule deleting `events/*/admin/*` objects older than a day that are not the current QR
  cannot be expressed in R2; ignore it.
