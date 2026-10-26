import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AdminEvent, AdminPostsResponse, ManifestEntry, QrUpload } from "@/lib/api";
import {
  ADMIN_LOGIN_MAX,
  ADMIN_LOGIN_WINDOW_MS,
  ADMIN_SESSION_S,
  MAX_QR_BYTES,
  PAGE_SIZE,
} from "@/lib/domain/limits";
import { decodeCursor, encodeCursor } from "@/lib/domain/posts";
import { looksLike, qrKey } from "@/lib/domain/uploads";
import type { updateEventBody } from "@/lib/validation";
import type { z } from "zod";
import { db } from "./db";
import { env } from "./env";
import { EVENT_COLUMNS, getEvent } from "./event";
import { AppError } from "./http";
import { r2 } from "./r2";
import { afterCursor, SELECT, toPost, type PostRow } from "./wall";

export const ADMIN_COOKIE = "wm_admin";

// Strict, not Lax: the admin screen is never opened from a link on another site.
const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_S,
  }) as const;

type CookieReader = { get(name: string): { value: string } | undefined };
type CookieJar = CookieReader & {
  set(name: string, value: string, options: ReturnType<typeof cookieOptions>): unknown;
  delete(name: string): unknown;
};

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

/** Changing ADMIN_PASSCODE changes this key, which signs every admin session out. */
const sessionKey = () => digest(`${env().ADMIN_PASSCODE}:${env().DEVICE_TOKEN_PEPPER}`);
const sign = (expires: string) => createHmac("sha256", sessionKey()).update(expires).digest("base64url");

const notAdmin = () => new AppError("not_admin", 401, "Please enter the admin passcode.");

/** True when the cookie holds a session this server signed and that has not run out. */
export function isAdmin(jar: CookieReader): boolean {
  const [expires = "", mac = ""] = (jar.get(ADMIN_COOKIE)?.value ?? "").split(".");
  if (!/^\d+$/.test(expires) || Number(expires) * 1000 <= Date.now()) return false;
  return sameSecret(mac, sign(expires));
}

export function requireAdmin(jar: CookieReader): void {
  if (!isAdmin(jar)) throw notAdmin();
}

/**
 * The caller's address, hashed: enough to throttle guesses without keeping an IP. An IPv6 user
 * owns a whole /64, so its first four groups are the bucket, not the full address.
 */
/**
 * Who is calling, for the login throttle. Only a header our own infrastructure sets can be
 * trusted: on Vercel that is `x-vercel-forwarded-for`; on a VPS it is the `x-real-ip` the reverse
 * proxy writes (nginx: `proxy_set_header X-Real-IP $remote_addr;`, which replaces anything the
 * client sent), else the last `x-forwarded-for` entry, the one the proxy appended. A client can
 * set any other header to a new value on every try, which would switch the throttle off.
 */
export function clientIp(headers: Pick<Headers, "get">, onVercel = Boolean(process.env.VERCEL)): string | null {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (onVercel) return headers.get("x-vercel-forwarded-for") ?? forwarded[0] ?? null;
  return headers.get("x-real-ip") ?? forwarded.at(-1) ?? null;
}

const ipHash = (address: string | null) => {
  const ip = address || "unknown";
  const bucket = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  return createHash("sha256").update(`${bucket}:${env().DEVICE_TOKEN_PEPPER}`).digest("hex");
};

/**
 * Checks the passcode. The attempt is counted before it is compared, so parallel guesses cannot
 * slip past the limit; a correct passcode wipes the caller's count.
 */
export async function login(passcode: string, address: string | null, jar: CookieJar): Promise<void> {
  const hash = ipHash(address);
  const { error } = await db().rpc("admin_login_attempt", {
    p_ip_hash: hash,
    p_since: new Date(Date.now() - ADMIN_LOGIN_WINDOW_MS).toISOString(),
    p_max: ADMIN_LOGIN_MAX,
  });
  if (error?.code === "PT429") {
    throw new AppError("rate_limited", 429, "Too many tries. Please wait 15 minutes and try again.");
  }
  if (error) throw new Error(`Recording the login attempt failed: ${error.code} ${error.message}`);
  if (!sameSecret(passcode, env().ADMIN_PASSCODE)) {
    throw new AppError("wrong_passcode", 401, "That passcode isn’t right.");
  }

  await db().rpc("admin_login_clear", { p_ip_hash: hash });
  const expires = String(Math.floor(Date.now() / 1000) + ADMIN_SESSION_S);
  jar.set(ADMIN_COOKIE, `${expires}.${sign(expires)}`, cookieOptions());
}

export function logout(jar: CookieJar): void {
  jar.delete(ADMIN_COOKIE);
}

// ---------------------------------------------------------------- event

const toAdminEvent = (e: Awaited<ReturnType<typeof getEvent>>): AdminEvent => ({
  groomName: e.groom_name,
  brideName: e.bride_name,
  headerMessage: e.header_message ?? "",
  uploadsOpen: e.uploads_open,
  qrAccountName: e.qr_account_name ?? "",
  qrBank: e.qr_bank ?? "",
  hasQr: e.qr_path !== null,
});

export async function getAdminEvent(): Promise<AdminEvent> {
  return toAdminEvent(await getEvent());
}

/** Empty text clears the optional fields; the couple's names cannot be empty (validated). */
export async function updateEvent(patch: z.infer<typeof updateEventBody>): Promise<AdminEvent> {
  const event = await getEvent();
  const columns = {
    ...(patch.groomName !== undefined && { groom_name: patch.groomName }),
    ...(patch.brideName !== undefined && { bride_name: patch.brideName }),
    ...(patch.headerMessage !== undefined && { header_message: patch.headerMessage || null }),
    ...(patch.qrAccountName !== undefined && { qr_account_name: patch.qrAccountName || null }),
    ...(patch.qrBank !== undefined && { qr_bank: patch.qrBank || null }),
    ...(patch.uploadsOpen !== undefined && { uploads_open: patch.uploadsOpen }),
  };
  const { data, error } = await db()
    .from("events")
    .update(columns)
    .eq("id", event.id)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new Error(`Updating the event failed: ${error.code} ${error.message}`);
  return toAdminEvent(data);
}

// ---------------------------------------------------------------- QR

const QR_KEY = (eventId: string) => new RegExp(`^events/${eventId}/admin/qr-[0-9a-f-]{36}\\.(png|jpg)$`);

/** A URL to PUT the QR image to. Nothing changes until `confirmQr`. */
export async function presignQr(mime: string, bytes: number): Promise<QrUpload> {
  const key = qrKey((await getEvent()).id, randomUUID(), mime);
  return { key, url: await r2().presignPut(key, mime, bytes) };
}

/**
 * Makes an uploaded image the QR. The key must be one this event's presign call could have made,
 * and the stored bytes must really be that image type. The old QR file is then removed.
 */
export async function confirmQr(key: string): Promise<AdminEvent> {
  const event = await getEvent();
  if (!QR_KEY(event.id).test(key)) throw new AppError("invalid_key", 400, "That isn’t a QR upload.");
  const mime = key.endsWith(".png") ? "image/png" : "image/jpeg";

  const object = await r2().head(key);
  const start = object ? await r2().peek(key) : null;
  if (
    !object ||
    object.overridden ||
    object.mime.split(";")[0]!.trim().toLowerCase() !== mime ||
    object.bytes > MAX_QR_BYTES ||
    !start ||
    !looksLike(mime, start)
  ) {
    throw new AppError("upload_incomplete", 400, "The QR image didn’t finish uploading. Please try again.");
  }

  const { data, error } = await db()
    .from("events")
    .update({ qr_path: key })
    .eq("id", event.id)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw new Error(`Saving the QR failed: ${error.code} ${error.message}`);

  // The new QR is live either way: a leftover file only wastes space.
  if (event.qr_path && event.qr_path !== key) {
    await r2().deleteMany([event.qr_path]).catch((e) => console.error("Removing the old QR failed", e));
  }
  return toAdminEvent(data);
}

/** The QR image for the public `/qr` route; null while the couple has not added one. */
export async function getQrObject(): Promise<{ body: ReadableStream<Uint8Array>; mime: string } | null> {
  const { qr_path } = await getEvent();
  if (!qr_path) return null;
  const res = await fetch(`${env().NEXT_PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "")}/${qr_path}`, { cache: "no-store" });
  if (!res.ok || !res.body) return null;
  return { body: res.body, mime: qr_path.endsWith(".png") ? "image/png" : "image/jpeg" };
}

// ---------------------------------------------------------------- moderation

/** One page of every post, hidden ones included, newest first. */
export async function getModerationPage(cursor: string | null): Promise<AdminPostsResponse> {
  const after = cursor === null ? null : decodeCursor(cursor);
  if (cursor !== null && !after) throw new AppError("invalid_cursor", 400, "That page link is not valid.");

  let query = db()
    .from("posts")
    .select(`${SELECT}, hidden`)
    .eq("event_id", (await getEvent()).id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "post_media" })
    .limit(PAGE_SIZE + 1);
  if (after) query = query.or(afterCursor(after));
  const { data, error } = await query;
  if (error) throw new Error(`Loading posts failed: ${error.code} ${error.message}`);

  const rows = data as unknown as (PostRow & { hidden: boolean })[];
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    posts: page.map((row) => ({ ...toPost(row), hidden: row.hidden })),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

/** Hide or unhide one post of this event. Hiding reaches open phones through the database trigger. */
export async function setHidden(postId: string, hidden: boolean): Promise<void> {
  const { data, error } = await db()
    .from("posts")
    .update({ hidden })
    .eq("id", postId)
    .eq("event_id", (await getEvent()).id)
    .select("id");
  if (error) throw new Error(`Updating the post failed: ${error.code} ${error.message}`);
  if (data.length === 0) throw new AppError("post_not_found", 404, "That post is already gone.");
}

// ---------------------------------------------------------------- download

const MANIFEST_PAGE = 1000;

// No path separators, and no leading dots: a guest named ".." must not climb out of the zip folder.
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/^[.\s]+|[.\s]+$/g, "") || "guest";

/**
 * Every photo and video of the event, hidden ones included, as `{url, name}` for the browser to zip.
 * ponytail: wishes are text, so they are not in the zip.
 */
export async function mediaManifest(): Promise<ManifestEntry[]> {
  const eventId = (await getEvent()).id;
  const base = env().NEXT_PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "");
  const rows: {
    id: string;
    created_at: string;
    guests: { name: string } | null;
    post_media: { path: string; position: number }[];
  }[] = [];
  // PostgREST caps one response (1000 rows by default), so read until a page comes back short.
  for (let from = 0; ; from += MANIFEST_PAGE) {
    const { data, error } = await db()
      .from("posts")
      .select("id, created_at, guests(name), post_media(path, position)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .order("position", { referencedTable: "post_media" })
      .range(from, from + MANIFEST_PAGE - 1);
    if (error) throw new Error(`Loading media failed: ${error.code} ${error.message}`);
    rows.push(...(data as unknown as typeof rows));
    if (data.length < MANIFEST_PAGE) break;
  }
  return rows.flatMap((p) =>
    p.post_media.map((m) => ({
      url: `${base}/${m.path}`,
      name: `${safe(p.guests?.name ?? "Guest")}/${p.created_at.slice(0, 10)}-${p.id.slice(0, 8)}-${m.position + 1}.${m.path.split(".").pop()}`,
    })),
  );
}
