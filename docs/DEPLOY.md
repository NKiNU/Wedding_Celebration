# Deploying Wedding Memories (one VPS, hosted Supabase, R2)

One deployment serves one wedding (`EVENT_SLUG`). Everything below is done once, then checked with
the launch checklist at the end. The R2 bucket and media domain are set up by following
[`R2-SETUP.md`](./R2-SETUP.md).

## 1. Supabase (production project)

1. Create a project. Copy the URL, the publishable (anon) key and the **secret / service-role** key.
2. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Create the event row. The seed is for local demos only, so run this once in the SQL editor:

   ```sql
   insert into public.events (slug, groom_name, bride_name)
   values ('<EVENT_SLUG>', 'Groom', 'Bride');   -- names and the header message are editable in /admin
   ```

4. Realtime: `posts` is in the `supabase_realtime` publication (migration 0001). In the dashboard,
   Realtime must be enabled for the project (it is by default).
5. Run the anonymous-access check against it (from a laptop, with `.env.local` pointing at the
   project): `SUPABASE_INTEGRATION=1 npx vitest run tests/integration/rls.test.ts`.
   It needs the event and at least one visible post; post one wish first. It makes no lasting change,
   but it hides one post for a moment (the wall drops it and brings it back) and writes a few throwaway
   `admin_attempts` rows, so run it before the event, not during.

## 2. The server

Needs Node 22.12 or newer. HTTPS is not optional: the session cookies are `Secure`, so over plain
http a phone cannot join at all.

```bash
git clone <repo> /srv/wedding && cd /srv/wedding
npm ci
set -a; . /etc/wedding.env; set +a   # `next build` reads NEXT_PUBLIC_* from the shell or ./.env*, not from /etc
npm run build
npm run check:bundle   # must print "Bundle clean ... 6 secret values": fewer means the secrets were not exported
npm start -- -H 127.0.0.1   # :3000, local only (add -p to change the port); systemd runs the same below
```

### Environment file (not in git)

`/etc/wedding.env`, mode `600`, owner the service user. Generate secrets with `openssl rand -base64 ...`
(only letters, digits, `+`, `/` and `=`), which both systemd and the shell above read safely. Keys are listed in `.env.example`, but write
only plain `KEY=value` lines here: systemd would read a trailing `# comment` as part of the value.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design. **Baked in at build time**: rebuild after changing them. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. |
| `ADMIN_PASSCODE` | A long random one: `openssl rand -base64 18`. The admin can change the QR and the name under it, and the only defence against guessing is length (5 tries per 15 min per address). |
| `DEVICE_TOKEN_PEPPER` | 32+ random characters. **Changing it signs every guest out and orphans their posts**, so set it once. |
| `CRON_SECRET` | `openssl rand -base64 24`. |
| `R2_*`, `NEXT_PUBLIC_MEDIA_BASE_URL` | From the R2 handoff. Leave `R2_ENDPOINT` and `R2_REGION` **empty**: they are the local-dev stand-in, and the app refuses to start with `R2_ENDPOINT` set under `NODE_ENV=production` (a local `npm start` against local storage opts in with `ALLOW_DEV_R2_ENDPOINT=1`). |
| `EVENT_SLUG` | The slug inserted above. |

After changing any variable: restart the service (and rebuild for `NEXT_PUBLIC_*`).

### systemd

```ini
# /etc/systemd/system/wedding.service
[Unit]
Description=Wedding Memories
After=network.target

[Service]
User=wedding
WorkingDirectory=/srv/wedding
EnvironmentFile=/etc/wedding.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now wedding`, logs with `journalctl -u wedding -f`. The app never logs
tokens, passcodes or cookie values; API errors log the Postgres or R2 error code only.

### HTTPS and the client address (Caddy)

```caddy
wedding.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
    }
}
```

The proxy **must replace** the client address headers (`header_up` sets them; do not append). The admin
login throttle and the flood guards on joining and reading the wall are counted per client address,
and a client could otherwise send a different forwarded address on every try.

nginx equivalent: `proxy_set_header X-Real-IP $remote_addr;` and
`proxy_set_header X-Forwarded-For $remote_addr;` (not `$proxy_add_x_forwarded_for`), plus a certbot
certificate. A venue's guests usually share one address (one Wi-Fi), which is why those guards are
loose: see `src/lib/domain/limits.ts`.

Close the firewall to everything but SSH, 80 and 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).

**Cloudflare in front of the app hostname?** Then Caddy's `{remote_host}` is a Cloudflare edge address
and every guest looks like a handful of strangers (the admin throttle and the flood guards would be
shared with them). Either keep the app's DNS record "DNS only" (grey cloud), or make Caddy trust
Cloudflare and read the real address:

```caddy
{
    servers {
        trusted_proxies static <Cloudflare IP ranges>
        client_ip_headers CF-Connecting-IP
    }
}
```

and send `header_up X-Real-IP {client_ip}` instead of `{remote_host}`. Check it: `/admin` with a wrong
passcode from two phones on different networks must count separately (`select ip_hash, count(*) from admin_attempts group by 1;`).

Do not terminate TLS at the app. The service binds to `127.0.0.1` (`-H` above) and the firewall keeps
port 3000 closed: if the app were reachable directly, a client could set `X-Real-IP` itself and walk past
every per-address limit, the admin login throttle included.

### Hourly sweep

Removes the files of uploads that were never posted. One line in the service user's crontab:

```
0 * * * * curl -fsS -H @/etc/wedding.cron-header https://wedding.example.com/api/cron/sweep >/dev/null
```

`/etc/wedding.cron-header` is one line, `Authorization: Bearer <CRON_SECRET>`, mode `600`, readable by the
cron user (it keeps the secret out of `ps`). A 401 from the route means `CRON_SECRET` differs between that file
and the service.

## 3. Launch checklist (the day before)

Run the first block yourself; the second needs real phones and the real bucket.

- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run check:bundle` are green.
- [ ] `curl -sI https://<app>/` answers over HTTPS; `curl -s https://<app>/api/session` returns `{"ok":true,...}`.
- [ ] Join on a phone over mobile data (not the venue Wi-Fi) and again on the venue Wi-Fi.
- [ ] `/admin` logs in with the production passcode. Wrong passcodes are throttled 5 per 15 minutes per address, stored in Postgres, so a restart does not clear it: wait, or run `delete from admin_attempts;` in the SQL editor.
- [ ] Upload the DuitNow QR in `/admin`, open the guest QR drawer, tap Download QR.
- [ ] The cron line ran once: `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/sweep` gives 200.
- [ ] Load check against a **staging copy**, never the live event:
      `LOAD_PHONES=100 INTEGRATION_BASE_URL=https://staging.example SUPABASE_INTEGRATION=1 npx vitest run tests/integration/load.test.ts`

Real devices (see the "To try" list in `PLAN.md`): iPhone Safari and Android Chrome, a 50 MB video on
slow 3G, an album swipe, a WhatsApp shared link, Download QR (iOS share sheet offers Save Image), a
HEVC `.mov` on Android, and a delete followed by reopening the exact image URL from a second phone
(needs the cache purge from `R2-SETUP.md`).

## Hardening

The app sends `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy and
an empty Permissions-Policy (`next.config.ts`). Add HSTS in Caddy once HTTPS works:
`header Strict-Transport-Security "max-age=31536000; includeSubDomains"`. Check:
`curl -sI https://<app>/ | grep -iE 'x-frame|content-security|strict-transport'`.

Not done on purpose: a script/connect CSP. It needs the Supabase and media hosts and `'unsafe-inline'` for
Next's bootstrap script (a nonce would force every page dynamic), so it protects little beyond
`frame-ancestors`; add it if the hosts are fixed and you can test uploads, Realtime and the QR download.

Realtime: the wall's `post_hidden` channel is private (migration 0005). In the Supabase dashboard
(Realtime → Settings) switch **Allow public access** off so no other public channel can be created with the
anon key.

## Limits worth knowing

- The flood guards (`src/lib/domain/limits.ts`) count per client address per minute, in the app's
  memory (one process). They are sized for a venue where every guest shares one Wi-Fi address. A
  guest who hits one sees "Too many requests" and the wall retries on the next event.
- `MAX_GUESTS_PER_EVENT` (1000) protects the database, not availability: a determined bot could fill it
  and lock real guests out. If that happens, remove the junk rows in the SQL editor
  (`delete from guests where created_at > '...' and id not in (select guest_id from posts);`) and the
  proxy can block the address (`remote_ip`). There is no CAPTCHA by design (name only, no accounts).

## After the wedding

`/admin` → Download zip for a laptop-sized event; for a very large one copy `events/<id>/` from the
bucket instead (the zip is built in the admin's tab). Then delete the Supabase project and the bucket
when the couple no longer wants the wall online: guest names are the only personal data held.
