import "server-only";
import { createHash } from "node:crypto";
import { env } from "./env";

/**
 * Who is calling, for the throttles. Only a header our own reverse proxy sets can be trusted: the
 * `x-real-ip` it writes (nginx: `proxy_set_header X-Real-IP $remote_addr;`, which replaces anything
 * the client sent), else the last `x-forwarded-for` entry, the one the proxy appended. A client can
 * set any other header to a new value on every try, which would switch the throttle off.
 */
export function clientIp(headers: Pick<Headers, "get">): string | null {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return headers.get("x-real-ip") ?? forwarded.at(-1) ?? null;
}

/**
 * The caller's address, hashed: enough to throttle without keeping an IP. An IPv6 user owns a
 * whole /64, so its first four groups are the bucket, not the full address.
 */
export function ipHash(address: string | null): string {
  return createHash("sha256").update(`${bucketOf(address || "unknown")}:${env().DEVICE_TOKEN_PEPPER}`).digest("hex");
}

/**
 * The first four groups of an IPv6 address, from its full form: proxies write the short form, and
 * `2001:db8::a:b:c:d` must not become its own bucket per value of `a`. An IPv4 address written as
 * IPv6 (`::ffff:1.2.3.4`) is that IPv4 address.
 */
export function bucketOf(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  if (!address.includes(":")) return address;
  const mapped = /^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address.replace(/^::/, "0:"));
  if (mapped) return mapped[1]!;
  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":");
}
