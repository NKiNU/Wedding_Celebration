# Deploying Wedding Memories

One Ubuntu VPS runs the app. Supabase (free tier) holds the data. Cloudflare R2 (free tier) holds photos and videos.
Do the steps in order. Anything marked "(check)" was not confirmed from the code: verify it before the event.

Replace these placeholders everywhere:
- `app.example.com` = your app address
- `media.example.com` = your media address (set up in section 3)
- `YOUR-SLUG` = the event slug, for example `ali-and-siti`

## 1. What you need

1. A domain you control, with two names pointing to the right places: `app.example.com` (to the VPS) and `media.example.com` (to R2, section 3).
2. An Ubuntu VPS with root or sudo access. Ports 80 and 443 must be open. Small is fine (1 GB RAM is enough, 2 GB is safer while building) (check).
3. A Supabase project (free tier). Section 2.
4. An R2 bucket (free tier, 10 GB). Your friends set this up. Section 3 is their checklist.
5. This repo on GitHub, or any place the VPS can `git clone` from.

## 2. Production Supabase

1. Go to supabase.com and create a new project. Save the database password somewhere safe.
2. In the project, open Project Settings, then API. Copy three things:
   - Project URL (goes in `NEXT_PUBLIC_SUPABASE_URL`)
   - the `anon` public key (goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - the `service_role` secret key (goes in `SUPABASE_SERVICE_ROLE_KEY`). Never share it or put it in the browser. (check: newer projects may call these "publishable" and "secret" keys. Use the pair that works with supabase-js.)
3. On your own computer, in the repo, run:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
   The project ref is the code in your project URL (`https://YOUR-PROJECT-REF.supabase.co`).
   `db push` creates all tables, rules and the live-wall setup (`0001` to `0005`).
4. Create the real event. Open the Supabase dashboard, then SQL Editor, and run:
   ```sql
   insert into public.events (slug, groom_name, bride_name)
   values ('YOUR-SLUG', 'Groom Name', 'Bride Name');
   ```
   `YOUR-SLUG` must be exactly the `EVENT_SLUG` you set in section 4. The header message, QR and uploads switch are edited later in `/admin`.

**Warning: do NOT run `supabase/seed.sql` in production.** It adds demo guests, demo posts and fake media. It is only for your local machine.
`npx supabase db reset` is also local only. Never run it against the production project.

Free-tier notes:
- Realtime allows about 200 phones connected at once (check the current limit on Supabase's pricing page). Phones beyond that still see new posts when they refresh or scroll.
- A free project pauses after about a week with no use. Open the dashboard the day before the event and make sure it says "Active". If it is paused, press Restore and wait a few minutes.

## 3. R2 checklist (for your friends)

Send this section to whoever owns the Cloudflare account.

1. Create an R2 bucket. Tell the owner the bucket name (`R2_BUCKET`) and the account ID (`R2_ACCOUNT_ID`, shown on the R2 overview page).
2. Create an API token for that one bucket only, with Object Read & Write. Send the Access Key ID and Secret Access Key (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). The secret is shown once.
3. Add a public custom domain to the bucket, for example `media.example.com` (bucket Settings, then Custom Domains). This is `NEXT_PUBLIC_MEDIA_BASE_URL`, written as `https://media.example.com`. Do not use the `r2.dev` address.
4. Set CORS on the bucket (Settings, then CORS policy). Replace the origin with the real app address:
   ```json
   [
     {
       "AllowedOrigins": ["https://app.example.com"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   `PUT` is for guest uploads. `GET` is needed for the admin "Download zip". Without it the zip fails with "Check that the media domain allows downloads". (check: if uploads still fail, try `"AllowedHeaders": ["*"]`.)
5. Cache-Control. Photos and videos are served through Cloudflare's cache. Use a short cache time on the media domain (a Cache Rule with Edge TTL and Browser TTL of 1 hour, for example) (check: the exact value is your choice). Short means a deleted file disappears sooner.
6. Purging a deleted file. When a guest or admin deletes a post, the file leaves R2 at once, but a copy may stay in Cloudflare's cache until it expires. To remove it sooner, purge that file's URL from the cache (Cloudflare dashboard, Caching, Purge by URL). To purge from a script, you need a Cloudflare API token with the Cache Purge permission. **The app does not purge automatically yet.** Hide/delete is safe for privacy only once the cache time has passed, or after a manual purge.
7. Add a Transform Rule (Rules, Transform Rules, Modify Response Header) for the media domain: set the response header `X-Content-Type-Options` to `nosniff`. This stops browsers guessing a file's type.
8. Storage limit. The free tier is 10 GB. The app caps the whole event at 9 GB (`MAX_EVENT_MB`, default 9216): when it is full, new photos and videos get a friendly "space is full" message, while wishes and the QR keep working. Videos are capped at 30 seconds and 80 MB each.

The friends then send you: account ID, bucket name, the two keys, and the media domain.

## 4. The server

Run these on the VPS as a user with sudo.

1. Install Node 22.12 or newer, plus git. Example with NodeSource (check: other install methods work too):
   ```bash
   sudo apt update && sudo apt install -y git curl
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v    # must be v22.12 or higher
   ```
2. Make a non-root user for the app and get the code:
   ```bash
   sudo adduser --system --group --home /opt/wedding wedding
   sudo -u wedding git clone https://github.com/YOU/Wedding_Celebration.git /opt/wedding/app
   ```
3. Create the env file. It holds secrets, so only root and the app user may read it:
   ```bash
   sudo nano /etc/wedding-memories.env
   sudo chown root:wedding /etc/wedding-memories.env
   sudo chmod 640 /etc/wedding-memories.env
   ```
   Paste this and fill in every line. No quotes, no spaces around `=`, no `export`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ADMIN_PASSCODE=
   DEVICE_TOKEN_PEPPER=
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=
   R2_ENDPOINT=
   R2_REGION=
   NEXT_PUBLIC_MEDIA_BASE_URL=https://media.example.com
   EVENT_SLUG=YOUR-SLUG
   CRON_SECRET=
   ```
   Optional limits (leave them out to use the defaults): `GUEST_JOINS_PER_IP` (new names per network per 10 min, default 300) and `MAX_EVENT_MB` (all posted photos and videos, default 9216 = 9 GB).
   **Never copy your laptop's `.env.local` to the server, and do not leave one in `/opt/wedding/app`** (`npm start` reads it automatically): it points uploads at local test storage and switches the join limit off.
   Make the secrets with:
   ```bash
   openssl rand -base64 18   # ADMIN_PASSCODE (long and random; this is the only guard on /admin)
   openssl rand -hex 32      # DEVICE_TOKEN_PEPPER
   openssl rand -hex 32      # CRON_SECRET (a different value)
   ```
   **`R2_ENDPOINT` and `R2_REGION` must stay empty in production.** They are for local testing only. On the first request the app refuses to run in production if `R2_ENDPOINT` points anywhere but the server itself (`journalctl` then shows "R2_ENDPOINT must not be set in production").
   Do not change `DEVICE_TOKEN_PEPPER` after guests have joined: only a hash of each guest's token is stored, made with the pepper, so a new pepper locks everyone out of their own names. Changing `ADMIN_PASSCODE` signs the admin out.
4. Build. The three `NEXT_PUBLIC_` values are baked into the app at build time, so the build must see the env file:
   ```bash
   cd /opt/wedding/app
   sudo -u wedding bash -c 'set -a; . /etc/wedding-memories.env; set +a; npm ci && npm run build && npm run check:bundle -- --strict'
   ```
   `check:bundle` proves no secret from the env file ended up in what browsers download; it must print "none found".
   If you change a `NEXT_PUBLIC_` value later, rebuild. Other values only need a restart.
5. Create the service: `sudo nano /etc/systemd/system/wedding-memories.service`
   ```ini
   [Unit]
   Description=Wedding Memories
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=wedding
   Group=wedding
   WorkingDirectory=/opt/wedding/app
   EnvironmentFile=/etc/wedding-memories.env
   Environment=NODE_ENV=production
   ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
   Restart=always
   RestartSec=3

   [Install]
   WantedBy=multi-user.target
   ```
   The app listens on `127.0.0.1:3000` only, so the outside world reaches it through the proxy in section 5.
6. Start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now wedding-memories
   sudo systemctl status wedding-memories
   journalctl -u wedding-memories -f     # live logs; Ctrl+C to leave
   ```
   After any env change: `sudo systemctl restart wedding-memories`.
   If the logs say "Invalid environment: SOME_NAME", that variable is missing or wrong.

## 5. HTTPS reverse proxy

Why this matters: the join cookies are `Secure`, so over plain http phones cannot join at all. The limits on new names and on admin login attempts trust only the client address the proxy writes. If the proxy does not set it, every guest looks like one visitor.

**Cloudflare:** the R2 media domain needs your domain on Cloudflare, where new DNS records are "Proxied" (orange cloud) by default. Set the record for `app.example.com` to **DNS only (grey cloud)**. If it stays proxied, the proxy below sees a Cloudflare address instead of the guest's, and everyone shares one limit. (If you do want it proxied, nginx needs `real_ip_header CF-Connecting-IP;` with `set_real_ip_from` for each of Cloudflare's published ranges.) The media domain itself stays proxied.

Guests on the venue Wi-Fi all share one address. That is expected: the default of 300 new names per 10 minutes allows for everyone joining at once.

Point the DNS name `app.example.com` at the VPS first, and wait until it resolves.

### Option A: Caddy (simplest, certificates are automatic)

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```
```
app.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
    }
}
```
```bash
sudo systemctl reload caddy
```
`header_up X-Forwarded-For {remote_host}` replaces whatever the visitor sent, instead of adding to it.
Large uploads do not pass through the app (phones send files straight to R2), so no size limit is needed here.

### Option B: nginx + certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/wedding
```
```nginx
server {
    server_name app.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/wedding /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com
```
Use `$remote_addr` for both headers (not `$proxy_add_x_forwarded_for`), so a visitor cannot fake an address.

Then open `https://app.example.com`. You should see the welcome screen.

## 6. Hourly sweep

The sweep deletes files from uploads that never became a post, and forgets old admin login attempts and old new-name counts (hashed addresses). The route is `GET /api/cron/sweep` and expects the header `Authorization: Bearer <CRON_SECRET>`.

Keep the secret in a root-only file, so it never shows up in the process list while curl runs:
```bash
echo "Authorization: Bearer PASTE_CRON_SECRET_HERE" | sudo tee /root/wedding-cron.header >/dev/null
sudo chmod 600 /root/wedding-cron.header
sudo crontab -e
```
Add one line (replace the address):
```
0 * * * * curl -fsS -H @/root/wedding-cron.header https://app.example.com/api/cron/sweep >/dev/null
```
Test it once by hand. Success prints JSON with status 200; a wrong or missing secret gives 401:
```bash
sudo curl -i -H @/root/wedding-cron.header https://app.example.com/api/cron/sweep
```

## 7. Smoke test

On a real phone, not a laptop, using mobile data (not your home Wi-Fi) if you can:

1. Open `https://app.example.com`. Type a name. Start. You should land on the wall.
2. Post a photo. It should appear on the wall.
3. Post a short video (under 30 s). Check it plays.
4. Send a wish.
5. Tap a card to open the viewer. Go Back.
6. Open `/admin`, log in with `ADMIN_PASSCODE`. Upload the DuitNow QR, fill the account name and bank. Try Hide and Unhide on a post. Try "Download zip".
7. Back on the wall, open the DuitNow QR and press Download QR.
8. Delete your test posts (Me drawer). Then, in Supabase, you can also delete the test guest rows (check).

Then go through the "To try after deploy" checklist in `docs/PLAN.md` (shared links from WhatsApp, HEVC video on Android, deleted media in the cache, album swipe on a real iPhone).

## 8. Updating later, and troubleshooting

To update:
```bash
cd /opt/wedding/app
sudo -u wedding git pull
sudo -u wedding bash -c 'set -a; . /etc/wedding-memories.env; set +a; npm ci && npm run build'
sudo systemctl restart wedding-memories
```
If the update has a new file in `supabase/migrations/`, run `npx supabase db push` from your own computer first.

Do not update during the event unless you must.

Troubleshooting:
- **Cannot join / the name box does nothing**: the page is not on HTTPS, or the proxy is not passing requests. Open the address with `https://`. Check section 5.
- **Blank page or 500 error**: run `journalctl -u wedding-memories -n 50`. "Invalid environment: NAME" means that variable is wrong.
- **Uploads fail (progress stops or errors)**: R2 CORS. Check the `AllowedOrigins` matches the app address exactly (`https://`, no trailing slash) and that `PUT` and `content-type` are allowed.
- **Photos upload but do not show**: `NEXT_PUBLIC_MEDIA_BASE_URL` is wrong, or the custom domain is not attached to the bucket. If you just changed it, rebuild (section 4, step 4).
- **"Download zip" fails**: the CORS rule is missing `GET`.
- **Admin locked out**: 5 wrong passcodes lock that network out for 15 minutes. Wait, or switch to mobile data. If everyone seems locked out at once, the proxy is not setting the client address (section 5).
- **Wall does not update live**: Supabase project is paused, or more than about 200 phones are connected. Refresh still works.
- **A deleted photo still opens by its link**: Cloudflare cache. Purge that URL (section 3, step 6).
- **Site down after a reboot**: `sudo systemctl status wedding-memories`; the unit is enabled so it should start by itself.
