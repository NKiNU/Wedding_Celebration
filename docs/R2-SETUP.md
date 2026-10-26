# Cloudflare R2 setup (production media)

Local development uses Supabase Storage in place of R2 (see the README). This guide is for real R2, which you need when you deploy. Why R2: [ADR 001](adr/001-r2-for-media.md).

Cloudflare renames menu items now and then. Match settings by name, not by exact click path.

## Status checklist

Last checked 2026-10-26 against the real bucket `wedding-memories`.

**Done**
- [x] Cloudflare account and R2 enabled
- [x] Bucket `wedding-memories` (Asia-Pacific)
- [x] Account API token, Object Read & Write, scoped to this bucket
- [x] Public Development URL (`pub-….r2.dev`) enabled
- [x] CORS policy for `http://localhost:3000`
- [x] `.env.local` points at R2 (`R2_ENDPOINT` and `R2_REGION` empty)
- [x] Real-bucket checks passed (see [step 8](#8-what-is-confirmed-on-real-r2))

**When you deploy to Vercel**
- [ ] Add the R2 variables and the rest of the production env in Vercel ([step 6](#6-environment-variables))
- [ ] Add the `https://<project>.vercel.app` address to the CORS `AllowedOrigins`
- [ ] Schedule the hourly call to `/api/cron/sweep`
- [ ] Upload a photo from a real phone on the deployed address

**Before the event**
- [ ] Decide on the media address: free `r2.dev` or your own domain ([step 3](#3-public-reads))
- [ ] With your own domain: connect `media.<domain>` and add the header rules ([step 5](#5-headers-on-the-media-domain))
- [ ] Remove `http://localhost:3000` from CORS
- [ ] Test on a real iPhone (Safari) and Android (Chrome), including slow 3G and a video near 100 MB
- [ ] Check R2 Metrics and pricing after a test with realistic uploads

**After the event**
- [ ] Back up the media (the admin zip download arrives in Phase 5)
- [ ] Delete or rotate the API token
- [ ] Turn off the Public Development URL
- [ ] Empty or delete the bucket

## What you need first

- A Cloudflare account with R2 enabled (it asks for a payment method, even on the free tier).
- The production app URL. Vercel gives you a free `https://<project>.vercel.app`; you do not need to buy a domain for the app.
- Optional: a domain whose DNS is on Cloudflare, only for a custom media address (`media.yourdomain.com`). A `*.vercel.app` address cannot be used for this, because you do not own its DNS.

## 1. Create the bucket

1. Cloudflare dashboard, **R2 Object Storage**, **Create bucket**.
2. Name it, for example `wedding-memories`. Pick the location closest to your guests (Asia-Pacific for Malaysia).
3. Copy your **Account ID** (it is also in the dashboard address bar, right after `dash.cloudflare.com/`).

```
R2_ACCOUNT_ID=<account id>
R2_BUCKET=wedding-memories
```

Do not choose an EU jurisdiction: the app builds `https://<account>.r2.cloudflarestorage.com`, and EU buckets use a different address (`<account>.eu.r2.cloudflarestorage.com`), which would need a small change in [src/server/r2.ts](../src/server/r2.ts).

## 2. Create an API token

1. R2 overview, **Manage API tokens**. The page offers two kinds. Choose **Create Account API token** (marked recommended: it stays active for production). A User API token stops working if you leave the organization.
2. Permission: **Object Read & Write**. Do not pick an Admin option.
3. Scope: **specific bucket(s) only**, and choose this bucket, not all buckets.
4. Leave out the client IP filter (Vercel's IPs change). Set the TTL to forever, or to a few days after the event.
5. Create it and copy the **Access Key ID** (32 characters) and **Secret Access Key** (64 characters) now. The secret is shown once. The **Token value** shown beside them is not used by this app.

```
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
```

The server signs uploads, and runs HEAD, ranged GET and DELETE, with this token. It never goes to the browser. Never put it in a `NEXT_PUBLIC_*` variable, and do not paste it into chats or commits.

## 3. Public reads

Guests view photos and videos from a public address, not through the app. Keys are unguessable UUIDs and bucket listing stays off, so only someone holding a link can fetch a file.

### Option A: no domain yet, free `r2.dev` address (fine for building and testing)

1. Bucket, **Settings**, **Public Development URL**, **Enable** (Cloudflare asks you to confirm).
2. Copy the address it shows.

```
NEXT_PUBLIC_MEDIA_BASE_URL=https://pub-xxxxxxxx.r2.dev
```

Cloudflare rate-limits this address and says it is not for production. It also does not support the header rules in step 5 (no `nosniff`, no long `Cache-Control`). I did not confirm the rate limit, and a small family event may never reach it.

### Option B: your own domain (recommended for the event)

1. Buy a domain (roughly RM 40 to 60 a year for a `.com` or `.my`), on Cloudflare or elsewhere, and add it to Cloudflare so Cloudflare manages its DNS.
2. Bucket, **Settings**, **Custom Domains**, **Add**. Enter `media.yourdomain.com`. Set the minimum TLS version to **1.2**. Continue and confirm. Cloudflare adds the DNS record and certificate (a few minutes).

```
NEXT_PUBLIC_MEDIA_BASE_URL=https://media.yourdomain.com
```

Switching from A to B only changes this one variable. The app does not use Next's image optimizer, so no code change is needed. No trailing slash. This value is public by design.

## 4. CORS policy

Guests upload from their phone straight to R2 with a signed `PUT`, so the bucket must allow your app's origin.

Bucket, **Settings**, **CORS Policy**, **Add**, and paste. Add your real app address next to localhost once you know it:

```json
[
  {
    "AllowedOrigins": ["https://<project>.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- Origins must match exactly: scheme and host, no trailing slash, no path. If you use a custom app domain later, add it too.
- `PUT` and `content-type`: the upload. The browser sets only `Content-Type` ([src/lib/upload.ts](../src/lib/upload.ts)); the length is derived from the file.
- `GET` and `HEAD`: the DuitNow QR "Download" fetches the image as a file for the share sheet (Phase 5). Harmless to add now. The same policy applies to the public address.
- `http://localhost:3000`: only for testing from your laptop. Remove it before the event.
- If you later adopt conditional uploads (`If-None-Match`), add `if-none-match` to `AllowedHeaders`.

## 5. Headers on the media domain

Needs Option B (a custom domain). These come from the Phase 6 security list in [PLAN.md](PLAN.md). I could not check the exact Cloudflare wording for these rules.

Cloudflare, your domain, **Rules**, **Transform Rules**, **Modify Response Header**, scoped to host `media.yourdomain.com`:

| Action | Header | Value |
|---|---|---|
| Set | `X-Content-Type-Options` | `nosniff` |
| Set | `Cache-Control` | `public, max-age=31536000, immutable` |
| Remove | `Content-Disposition` | |
| Remove | `Content-Encoding` | |

Why: a guest could otherwise upload a file with a forged `Content-Disposition` or `Content-Encoding`, and the media domain would serve it back. The app already rejects such uploads at its HEAD check, and this is the second layer. `immutable` is safe because every file has a unique key. When you delete a post, also purge it from the Cloudflare cache.

## 6. Environment variables

Set these in **Vercel, Project, Settings, Environment Variables** (Production, and Preview if you test there). Locally they go in `.env.local`.

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | from step 1 |
| `R2_BUCKET` | from step 1 |
| `R2_ACCESS_KEY_ID` | from step 2 |
| `R2_SECRET_ACCESS_KEY` | from step 2 |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | from step 3 |
| `R2_ENDPOINT` | **leave empty** (dev only; the app refuses it when `VERCEL_ENV=production`) |
| `R2_REGION` | **leave empty** (defaults to `auto`) |

Also set the rest of the production env (Supabase keys, `ADMIN_PASSCODE`, `DEVICE_TOKEN_PEPPER`, `CRON_SECRET`, `EVENT_SLUG`) as listed in [.env.example](../.env.example). If you edit `.env.local` by hand, keep `EVENT_SLUG` and `CRON_SECRET`: without them the app refuses to start ("Invalid environment: EVENT_SLUG, CRON_SECRET").

To go back to local storage, keep a copy of your local values (`R2_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3`, `R2_REGION=local`, `R2_BUCKET=wedding`, the `S3_PROTOCOL_*` keys from `npx supabase status`, and the local media URL, see the README).

## 7. Test it against the real bucket

1. Back up `.env.local`, then put the R2 values from steps 1 to 3 in it. Leave `R2_ENDPOINT` and `R2_REGION` empty.
2. Run the upload browser test on its own, so it does not depend on the seed counts:
   ```bash
   E2E_UPLOADS=1 npx playwright test --no-deps --project=iphone-safari-create --project=android-chrome-create -g "three photos"
   ```
   It posts an album from a simulated phone straight to R2. Note it leaves 6 files per run in the bucket.
3. In the dashboard, open the bucket, **Objects**, and look under `events/<eventId>/<postId>/`. The list sorts folders by ID, not by time, so a new upload is not at the top. The "Bucket Size" figure lags by hours.
4. Open one file through the media address and check its headers (with Option B: `nosniff`, the long `Cache-Control`, no `Content-Disposition` or `Content-Encoding`).
5. Upload a photo from your phone on the deployed address. The PUT must show no CORS error.
6. Delete the test objects (select them in the dashboard, or delete by key with the same token) and restore your local `.env.local`.

## 8. What is confirmed on real R2

Checked on 2026-10-26 against `wedding-memories`, signing requests the same way the app does:

| Check | Result |
|---|---|
| Preflight from `http://localhost:3000` | 204, origin and `content-type` allowed |
| Preflight from another origin | 403 (blocked) |
| PUT with the signed type and size | 200 |
| PUT with a different type, a different size, or an edited link | 403 |
| HEAD returns the size and type | yes, no `content-disposition` / `content-encoding` |
| Ranged GET (`bytes=0-15`) | 206 |
| Public read through the `r2.dev` address | 200, correct `content-type` |
| Public read with an `Origin` header | CORS header returned (needed for QR download) |
| `If-None-Match: *` on an existing object | 412, so conditional upload is supported |
| Browser test, three photos as an album, iPhone and Android profiles | passed |

Not yet confirmed:
- `nosniff` and `Cache-Control` on the media address: not present on `r2.dev`, and need Option B plus the step 5 rules.
- Conditional upload is supported by R2, but the app does not use it yet. [PLAN.md](PLAN.md) lists it for Phase 6, so an owner could still overwrite a file after posting.
- Real phone devices and slow 3G.

## 9. After the event

- Delete or rotate the API token.
- Turn off the Public Development URL.
- Download the media (the admin zip, once Phase 5 is built), then empty the bucket if you no longer need it.
- The cleanup route `/api/cron/sweep` needs a scheduler that calls it hourly with `Authorization: Bearer <CRON_SECRET>`. Vercel's free plan may limit cron jobs to once a day; if so, use another scheduler.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser console shows a CORS error on upload | Your app origin is missing from `AllowedOrigins` (exact match, no trailing slash), or `content-type` is missing from `AllowedHeaders` |
| Upload returns 403 | The file's type or size differs from what was signed, or the 15-minute link expired (slow connection) |
| Upload works but images do not show | `NEXT_PUBLIC_MEDIA_BASE_URL` is wrong, or the public address is not enabled |
| App fails at start with an env error | `R2_ENDPOINT` is set in production, a required value is empty, or `EVENT_SLUG` / `CRON_SECRET` is missing |
| New posts still go to local storage | `R2_ENDPOINT` is still set in `.env.local`; clear it and restart the dev server |
| Tapping a post shows a 404 | The post viewer `/p/[id]` is Phase 4 and is not built yet |
| Download QR fails in the browser | `GET` is missing from the CORS methods |
| Dashboard shows "0 B" bucket size | The usage metric lags; check **Objects** instead |
