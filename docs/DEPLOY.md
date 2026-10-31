# Deploying Wedding Memories

One Debian or Ubuntu VPS runs the app. Supabase (free tier) holds the data. Cloudflare R2 (free tier) holds photos and videos. Cloudflare also runs the domain's DNS. After the first setup, every push to `main` that passes CI deploys by itself (section 8).
Do the steps in order. Anything marked "(check)" was not confirmed from the code: verify it before the event.

Replace these placeholders everywhere:
- `yourdomain.com` = the domain you bought
- `app.yourdomain.com` = your app address
- `media.yourdomain.com` = your media address (set up in section 4)
- `YOUR-SLUG` = the event slug, for example `ali-and-siti`
- `YOU/Wedding_Celebration` = your GitHub repo
- `VPS-IP` = the server's public IP address

## 1. What you need

1. A domain you control. Section 2 moves its DNS to Cloudflare so you can make `app.` and `media.` subdomains.
2. A Debian 12 or Ubuntu VPS where you can run `sudo`. Ports 80 and 443 must be open. 2 GB RAM and about 2 GB of free disk for the build.
3. A Supabase project (free tier). Section 3.
4. An R2 bucket (free tier, 10 GB) in the **same Cloudflare account** as the domain. Section 4.
5. This repo on GitHub.

### Check the VPS first

The VPS may already run other things. Log in and look before installing anything:
```bash
sudo -v                       # must not say "may not run sudo"
df -h /                       # need about 2 GB free
sudo ss -tlnp                 # which ports are taken
node -v                       # if present: must be v22.12 or higher
```
- **No sudo?** On OVH, log in as the default `debian` user (password in the OVH welcome email, or reset it in the OVH panel), then run `sudo usermod -aG sudo YOUR-USER`. Log out and back in.
- **Disk nearly full?** See what uses it: `sudo du -xh / --max-depth=2 2>/dev/null | sort -rh | head -15`. Safe to clear: `sudo apt clean` and `sudo journalctl --vacuum-size=100M`. Do not delete other apps' files.
- **Ports:** this guide runs the app on `127.0.0.1:3200`. If 3200 is taken, pick another free port and use it everywhere this guide says 3200. If something already listens on 80 or 443 (another site's nginx or Caddy), do not install a second proxy: add the site block from section 6 to the one already running.

## 2. Domain on Cloudflare

Do this as early as you can: the nameserver change can take a few hours.

1. Log in at dash.cloudflare.com (free account). Use the same account that will hold the R2 bucket.
2. "Add a domain", type `yourdomain.com`, pick the **Free** plan.
3. Cloudflare copies the domain's existing DNS records. Keep any that are in use (a website, email), then continue.
4. Cloudflare shows two nameservers, like `xxx.ns.cloudflare.com`. Copy both.
5. At the registrar (Exabytes: client area, Domains, your domain, Nameservers): choose custom nameservers, replace the old ones with the two from Cloudflare, save. If DNSSEC is on for the domain there, turn it off first.
6. Back in Cloudflare, press "Check nameservers". When the status says **Active** (minutes to a few hours), carry on.
7. Add the app record: DNS, Records, Add record:
   - Type `A`, Name `app`, IPv4 address `VPS-IP`
   - Proxy status: **DNS only (grey cloud)**. Section 6 explains why.
8. Check from your computer: `nslookup app.yourdomain.com` must return `VPS-IP`.

Do not add `media` by hand: R2 creates it in section 4.

## 3. Production Supabase

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
   `YOUR-SLUG` must be exactly the `EVENT_SLUG` you set in section 5. The header message, QR and uploads switch are edited later in `/admin`.

**Warning: do NOT run `supabase/seed.sql` in production.** It adds demo guests, demo posts and fake media. It is only for your local machine.
`npx supabase db reset` is also local only. Never run it against the production project.

Free-tier notes:
- Realtime allows about 200 phones connected at once (check the current limit on Supabase's pricing page). Phones beyond that still see new posts when they refresh or scroll.
- A free project pauses after about a week with no use. Open the dashboard the day before the event and make sure it says "Active". If it is paused, press Restore and wait a few minutes.

## 4. R2 checklist (for your friends)

Send this section to whoever manages R2. The bucket must be in the Cloudflare account that holds `yourdomain.com` (section 2), or step 3 cannot attach the media domain.

1. Create an R2 bucket. Note the bucket name (`R2_BUCKET`) and the account ID (`R2_ACCOUNT_ID`, shown on the R2 overview page).
2. Create an API token for that one bucket only, with Object Read & Write. Send the Access Key ID and Secret Access Key (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). The secret is shown once.
3. Add a public custom domain to the bucket: `media.yourdomain.com` (bucket Settings, then Custom Domains). Cloudflare creates the DNS record itself and keeps it proxied (orange cloud); that is correct for media. This is `NEXT_PUBLIC_MEDIA_BASE_URL`, written as `https://media.yourdomain.com`. Do not use the `r2.dev` address.
4. Set CORS on the bucket (Settings, then CORS policy). Replace the origin with the real app address:
   ```json
   [
     {
       "AllowedOrigins": ["https://app.yourdomain.com"],
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

You need back: account ID, bucket name, the two keys, and the media domain.

## 5. The server

Run these on the VPS as your sudo user.

1. Install git and curl. If `node -v` printed v22.12 or higher in section 1, skip the Node lines. Otherwise install Node with NodeSource (check: other install methods work too):
   ```bash
   sudo apt update && sudo apt install -y git curl
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v    # must be v22.12 or higher
   ```
2. Make a user for the app. It gets a shell because the auto-deploy in section 8 logs in as it:
   ```bash
   sudo adduser --system --group --home /opt/wedding --shell /bin/bash wedding
   ```
3. Give that user read-only access to the repo with a GitHub deploy key (works for private and public repos):
   ```bash
   sudo -u wedding mkdir -p -m 700 /opt/wedding/.ssh
   sudo -u wedding ssh-keygen -t ed25519 -N "" -C wedding-vps-read -f /opt/wedding/.ssh/id_ed25519
   sudo cat /opt/wedding/.ssh/id_ed25519.pub
   ```
   On GitHub: repo, Settings, Deploy keys, Add deploy key. Paste the printed line, title "VPS read", leave "Allow write access" **off**. Then test and clone:
   ```bash
   sudo -u wedding ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # "successfully authenticated" is good
   sudo -u wedding git clone git@github.com:YOU/Wedding_Celebration.git /opt/wedding/app
   ```
4. Create the env file. It holds secrets, so only root and the app user may read it:
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
   NEXT_PUBLIC_MEDIA_BASE_URL=https://media.yourdomain.com
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
5. Build. The three `NEXT_PUBLIC_` values are baked into the app at build time, so the build must see the env file:
   ```bash
   cd /opt/wedding/app
   sudo -u wedding bash -c 'set -a; . /etc/wedding-memories.env; set +a; npm ci && npm run build && npm run check:bundle -- --strict'
   ```
   `check:bundle` proves no secret from the env file ended up in what browsers download; it must print "none found".
   If you change a `NEXT_PUBLIC_` value later, rebuild. Other values only need a restart.
6. Find where npm lives (systemd needs the full path):
   ```bash
   command -v npm     # for example /usr/bin/npm or /usr/local/bin/npm
   ```
   Create the service: `sudo nano /etc/systemd/system/wedding-memories.service`. Put that npm path in `ExecStart`:
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
   ExecStart=/usr/local/bin/npm start -- -H 127.0.0.1 -p 3200
   Restart=always
   RestartSec=3

   [Install]
   WantedBy=multi-user.target
   ```
   The app listens on `127.0.0.1:3200` only, so the outside world reaches it through the proxy in section 6.
7. Start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now wedding-memories
   sudo systemctl status wedding-memories
   curl -I http://127.0.0.1:3200            # expect HTTP/1.1 200
   journalctl -u wedding-memories -f        # live logs; Ctrl+C to leave
   ```
   After any env change: `sudo systemctl restart wedding-memories`.
   If the logs say "Invalid environment: SOME_NAME", that variable is missing or wrong.

## 6. HTTPS reverse proxy

Why this matters: the join cookies are `Secure`, so over plain http phones cannot join at all. The limits on new names and on admin login attempts trust only the client address the proxy writes. If the proxy does not set it, every guest looks like one visitor.

**Cloudflare:** the `app` record must be **DNS only (grey cloud)** (section 2). If it is proxied, the proxy below sees a Cloudflare address instead of the guest's, and everyone shares one limit. (If you do want it proxied, nginx needs `real_ip_header CF-Connecting-IP;` with `set_real_ip_from` for each of Cloudflare's published ranges.) The media domain itself stays proxied.

Guests on the venue Wi-Fi all share one address. That is expected: the default of 300 new names per 10 minutes allows for everyone joining at once.

Before you start: `nslookup app.yourdomain.com` returns `VPS-IP`, and ports 80 and 443 are open. Check the host's firewall (OVH panel, Network firewall, if it is on) and the server's own (`sudo ufw status`; if active, `sudo ufw allow 80,443/tcp`).

### Option A: Caddy (simplest, certificates are automatic)

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```
```
app.yourdomain.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3200 {
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
    server_name app.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3200;
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
sudo certbot --nginx -d app.yourdomain.com
```
Use `$remote_addr` for both headers (not `$proxy_add_x_forwarded_for`), so a visitor cannot fake an address.

Then open `https://app.yourdomain.com`. You should see the welcome screen.

## 7. Hourly sweep

The sweep deletes files from uploads that never became a post, and forgets old admin login attempts and old new-name counts (hashed addresses). The route is `GET /api/cron/sweep` and expects the header `Authorization: Bearer <CRON_SECRET>`.

Keep the secret in a root-only file, so it never shows up in the process list while curl runs:
```bash
echo "Authorization: Bearer PASTE_CRON_SECRET_HERE" | sudo tee /root/wedding-cron.header >/dev/null
sudo chmod 600 /root/wedding-cron.header
sudo crontab -e
```
Add one line:
```
0 * * * * curl -fsS -H @/root/wedding-cron.header https://app.yourdomain.com/api/cron/sweep >/dev/null
```
Test it once by hand. Success prints JSON with status 200; a wrong or missing secret gives 401:
```bash
sudo curl -i -H @/root/wedding-cron.header https://app.yourdomain.com/api/cron/sweep
```

## 8. Auto-deploy from GitHub

After this, a push to `main` runs CI (lint, typecheck, tests, build). If it passes, GitHub logs in to the VPS and runs one script that pulls, builds and restarts. No manual `git pull`.

Set it up only after sections 5 to 7 work by hand.

1. The deploy script. Keep it **outside** the repo, so `git reset` cannot rewrite it while it runs:
   ```bash
   sudo nano /opt/wedding/deploy.sh
   ```
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd /opt/wedding/app
   git fetch origin main
   git reset --hard origin/main
   set -a; . /etc/wedding-memories.env; set +a
   npm ci
   npm run build
   npm run check:bundle -- --strict
   sudo -n /usr/bin/systemctl restart wedding-memories
   echo "deployed $(git rev-parse --short HEAD)"
   ```
   ```bash
   sudo chown wedding:wedding /opt/wedding/deploy.sh
   sudo chmod 750 /opt/wedding/deploy.sh
   ```
2. Let the app user restart its own service, and nothing else:
   ```bash
   echo 'wedding ALL=(root) NOPASSWD: /usr/bin/systemctl restart wedding-memories' | sudo tee /etc/sudoers.d/wedding-deploy
   sudo chmod 440 /etc/sudoers.d/wedding-deploy
   sudo visudo -c        # must say "parsed OK"
   ```
3. Test the script by hand: `sudo -u wedding /opt/wedding/deploy.sh`. It must end with `deployed <commit>`.
4. A key just for GitHub Actions. Make it on your own computer, not the VPS (PowerShell shown):
   ```powershell
   ssh-keygen -t ed25519 -C github-deploy -N '""' -f $env:USERPROFILE\wedding-deploy
   Get-Content $env:USERPROFILE\wedding-deploy.pub
   ```
   On the VPS, add the public key with a lock so it can only run the deploy script (one line; paste your key after `ssh-ed25519`):
   ```bash
   sudo -u wedding nano /opt/wedding/.ssh/authorized_keys
   ```
   ```
   command="/opt/wedding/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... github-deploy
   ```
   ```bash
   sudo chmod 600 /opt/wedding/.ssh/authorized_keys
   ```
   Test from your computer: `ssh -i $env:USERPROFILE\wedding-deploy wedding@VPS-IP` runs a deploy and ends with `deployed <commit>`.
5. GitHub secrets: repo, Settings, Secrets and variables, Actions, New repository secret:
   - `DEPLOY_SSH_KEY`: the whole private key file (`wedding-deploy`, not `.pub`), including the BEGIN and END lines
   - `DEPLOY_HOST`: `VPS-IP`
   - `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan -t ed25519 VPS-IP` (this pins the server, so GitHub never sends the key to an impostor)

   Then delete the private key from your computer, or keep it only in a password manager.
6. Turn the job on: repo, Settings, Secrets and variables, Actions, **Variables** tab, New repository variable `DEPLOY_ENABLED` = `true`. Until it is set, the `deploy` job in `.github/workflows/ci.yml` is skipped and only the checks run. Once on, it runs only on a push to `main`, only after the `check` job passed, and one deploy at a time. Pull requests only run checks.

Limits:
- **Database changes are not automatic.** If a change adds a file in `supabase/migrations/`, run `npx supabase db push` from your computer **before** merging it to `main`.
- The build runs on the VPS. Keep an eye on `df -h /`: each deploy needs room for `node_modules` and the build.
- The site can misbehave for a few seconds while it builds and restarts. If a deploy fails halfway (the Actions run is red), the site may stay broken until the next good deploy: open the run log, fix, push again, or run the script by hand.
- Do not push to `main` on the event day.

## 9. Smoke test

On a real phone, not a laptop, using mobile data (not your home Wi-Fi) if you can:

1. Open `https://app.yourdomain.com`. Type a name. Start. You should land on the wall.
2. Post a photo. It should appear on the wall.
3. Post a short video (under 30 s). Check it plays.
4. Send a wish.
5. Tap a card to open the viewer. Go Back.
6. Open `/admin`, log in with `ADMIN_PASSCODE`. Upload the DuitNow QR, fill the account name and bank. Try Hide and Unhide on a post. Try "Download zip".
7. Back on the wall, open the DuitNow QR and press Download QR.
8. Delete your test posts (Me drawer). Then, in Supabase, you can also delete the test guest rows (check).

Then go through the "To try after deploy" checklist in `docs/PLAN.md` (shared links from WhatsApp, HEVC video on Android, deleted media in the cache, album swipe on a real iPhone).

## 10. Updating later, and troubleshooting

Normal path: merge to `main`, auto-deploy does the rest (section 8). Watch the run in the repo's Actions tab.

Manual fallback (auto-deploy not set up, or GitHub is down):
```bash
sudo -u wedding /opt/wedding/deploy.sh
```
If the update has a new file in `supabase/migrations/`, run `npx supabase db push` from your own computer first.

Do not update during the event unless you must.

Troubleshooting:
- **Cannot join / the name box does nothing**: the page is not on HTTPS, or the proxy is not passing requests. Open the address with `https://`. Check section 6.
- **Blank page or 500 error**: run `journalctl -u wedding-memories -n 50`. "Invalid environment: NAME" means that variable is wrong.
- **Service will not start, "No such file or directory"**: the npm path in `ExecStart` is wrong. Run `command -v npm` and fix it (section 5, step 6), then `sudo systemctl daemon-reload` and restart.
- **Uploads fail (progress stops or errors)**: R2 CORS. Check the `AllowedOrigins` matches the app address exactly (`https://`, no trailing slash) and that `PUT` and `content-type` are allowed.
- **Photos upload but do not show**: `NEXT_PUBLIC_MEDIA_BASE_URL` is wrong, or the custom domain is not attached to the bucket. If you just changed it, rebuild (section 5, step 5).
- **"Download zip" fails**: the CORS rule is missing `GET`.
- **Admin locked out**: 5 wrong passcodes lock that network out for 15 minutes. Wait, or switch to mobile data. If everyone seems locked out at once, the proxy is not setting the client address (section 6).
- **Wall does not update live**: Supabase project is paused, or more than about 200 phones are connected. Refresh still works.
- **A deleted photo still opens by its link**: Cloudflare cache. Purge that URL (section 4, step 6).
- **Site down after a reboot**: `sudo systemctl status wedding-memories`; the unit is enabled so it should start by itself.
- **Deploy job fails with "Permission denied (publickey)"**: `DEPLOY_SSH_KEY` is not the private key that matches the line in `/opt/wedding/.ssh/authorized_keys`, or that file is not mode 600 and owned by `wedding`.
- **Deploy job fails with "Host key verification failed"**: `DEPLOY_KNOWN_HOSTS` is empty or from another server. Run `ssh-keyscan -t ed25519 VPS-IP` again and update the secret.
- **Deploy fails at `git fetch`**: the read-only deploy key from section 5, step 3 was removed from GitHub.
- **Deploy fails at "sudo: a password is required"**: the sudoers line from section 8, step 2 is missing, or `systemctl` is not at `/usr/bin/systemctl` (check with `command -v systemctl`).
