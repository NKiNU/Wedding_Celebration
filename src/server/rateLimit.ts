import "server-only";
import { GUEST_JOIN_WINDOW_MS } from "@/lib/domain/limits";
import { db } from "./db";
import { env } from "./env";
import { AppError } from "./http";
import { clientIp, ipHash } from "./ip";

// The wall itself (GET /api/posts) has no limit on purpose: every phone refetches it on each new
// post, so a venue sharing one address would freeze its own live wall, and the same posts are
// readable with the public anon key anyway.
const RULES = {
  guest_join: {
    max: () => env().GUEST_JOINS_PER_IP,
    windowMs: GUEST_JOIN_WINDOW_MS,
    message: "Lots of new names from this network just now. Please wait a few minutes and try again.",
  },
} as const;

/** The longest window: the hourly sweep keeps rate-limit rows this long (sweep.ts). */
export const LONGEST_WINDOW_MS = Math.max(...Object.values(RULES).map((r) => r.windowMs));

/**
 * Counts one request from this caller's address and refuses it over the limit (migration 0005:
 * count and insert under one lock, the window measured by the database clock, so a parallel burst
 * cannot slip past). Fails closed: if the count cannot be recorded, the request fails.
 */
export async function throttle(scope: keyof typeof RULES, headers: Pick<Headers, "get">): Promise<void> {
  const rule = RULES[scope];
  const { error } = await db().rpc("rate_limit_hit", {
    p_scope: scope,
    p_key: ipHash(clientIp(headers)),
    p_window_s: rule.windowMs / 1000,
    p_max: rule.max(),
  });
  if (error?.code === "PT429") throw new AppError("rate_limited", 429, rule.message);
  if (error) throw new Error(`Recording the request failed: ${error.code} ${error.message}`);
}
