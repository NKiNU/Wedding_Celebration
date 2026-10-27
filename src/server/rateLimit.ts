import "server-only";
import { API_RATE_WINDOW_MS } from "@/lib/domain/limits";
import { AppError } from "./http";

const SWEEP_AT = 10_000; // entries; from here a pass (at most every SWEEP_EVERY_MS) drops ended windows
const SWEEP_EVERY_MS = 10_000;
const HARD_CAP = 50_000; // entries; past this the oldest tenth is forgotten, so memory stays bounded

type Window = { start: number; ms: number; count: number };
// ponytail: counts live in this process, which is the whole deployment (one VPS, one `npm start`).
// A second instance would double the allowance; move the counter into Postgres if that happens.
// Past HARD_CAP live addresses (a flood from tens of thousands of /64s) the limits fail open for the
// oldest ones: the reverse proxy is the defence at that scale.
const windows = new Map<string, Window>();
let lastSweep = 0;

/** The address a limit is counted against: IPv6 by its /64 (`::` expanded first), so a host can't dodge it by rotating. */
export function ipBucket(address: string | null): string {
  if (!address) return "unknown";
  const ip = address.split("%")[0]!.toLowerCase(); // drop an IPv6 zone id
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1]!;
  const [head = "", tail] = ip.split("::");
  const side = (part: string) => (part ? part.split(":") : []);
  const groups =
    tail === undefined
      ? side(head)
      : [...side(head), ...Array<string>(Math.max(0, 8 - side(head).length - side(tail).length)).fill("0"), ...side(tail)];
  return groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":");
}

/**
 * Who is calling. Only a header our own infrastructure sets can be trusted: on Vercel that is
 * `x-vercel-forwarded-for`; on a VPS it is the `x-real-ip` the reverse proxy writes (nginx:
 * `proxy_set_header X-Real-IP $remote_addr;`, which replaces anything the client sent), else the
 * last `x-forwarded-for` entry, the one the proxy appended. A client can set any other header to a
 * new value on every try, which would switch every per-address limit off.
 */
export function clientIp(headers: Pick<Headers, "get">, onVercel = Boolean(process.env.VERCEL)): string | null {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (onVercel) return headers.get("x-vercel-forwarded-for") ?? forwarded[0] ?? null;
  return headers.get("x-real-ip") ?? forwarded.at(-1) ?? null;
}

/**
 * Counts one call of `bucket` from `address`; refuses with 429 once it passes `max` inside
 * `windowMs`. A refused call is still counted, so hammering does not earn a fresh window early.
 */
export function rateLimit(bucket: string, address: string | null, max: number, windowMs = API_RATE_WINDOW_MS): void {
  const now = Date.now();
  const key = `${bucket}:${ipBucket(address)}`;
  const current = windows.get(key);
  if (current && now - current.start < current.ms) {
    if (++current.count > max) {
      throw new AppError("rate_limited", 429, "Too many requests. Please wait a moment and try again.");
    }
    return;
  }
  windows.delete(key); // a restarted window goes to the back of the Map's order, so the front is the oldest
  if (windows.size >= SWEEP_AT && now - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = now;
    for (const [k, w] of windows) if (now - w.start >= w.ms) windows.delete(k);
  }
  if (windows.size >= HARD_CAP) {
    let drop = HARD_CAP / 10;
    for (const k of windows.keys()) {
      if (drop-- <= 0) break;
      windows.delete(k);
    }
  }
  windows.set(key, { start: now, ms: windowMs, count: 1 });
}

export const resetRateLimits = () => {
  windows.clear();
  lastSweep = 0;
};
export const trackedWindows = () => windows.size;
