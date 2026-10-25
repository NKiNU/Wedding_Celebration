import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { KnownGuest, Session } from "@/lib/api";
import { MAX_NAMES_PER_PHONE } from "@/lib/domain/limits";
import { suggestNames } from "@/lib/domain/names";
import { addToken } from "@/lib/domain/tokens";
import { db } from "./db";
import { env } from "./env";
import { getEvent } from "./event";
import { AppError } from "./http";

const TOKENS_COOKIE = "wm_tokens"; // raw tokens of every name created on this phone
const ACTIVE_COOKIE = "wm_active"; // the raw token of the current identity
const UNIQUE_VIOLATION = "23505";

// Secure cookies are dropped over plain http, which would break testing on a phone over the LAN.
const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  }) as const;

type CookieReader = { get(name: string): { value: string } | undefined };
type CookieJar = CookieReader & {
  set(name: string, value: string, options: ReturnType<typeof cookieOptions>): unknown;
  delete(name: string): unknown;
};

const tokenList = z.array(z.string().min(1)).max(MAX_NAMES_PER_PHONE);

export const hashToken = (token: string, pepper: string) =>
  createHash("sha256")
    .update(token + pepper)
    .digest("hex");

/** The phone's tokens, or none when the cookie is missing or has been tampered with. */
export function readTokens(jar: CookieReader): string[] {
  try {
    return tokenList.parse(JSON.parse(jar.get(TOKENS_COOKIE)?.value ?? "null"));
  } catch {
    return [];
  }
}

/** Guests this phone holds a token for, in cookie order. The token is what proves ownership. */
async function guestsOnThisPhone(jar: CookieReader) {
  const tokens = readTokens(jar);
  if (tokens.length === 0) return [];
  const pepper = env().DEVICE_TOKEN_PEPPER;
  const hashes = tokens.map((t) => hashToken(t, pepper));
  const { data, error } = await db()
    .from("guests")
    .select("id, name, token_hash")
    .eq("event_id", (await getEvent()).id)
    .in("token_hash", hashes);
  if (error) throw new Error(`Loading guests failed: ${error.code} ${error.message}`);
  return tokens.flatMap((token, i) => {
    const row = data.find((r) => r.token_hash === hashes[i]);
    return row ? [{ token, guest: { guestId: row.id, name: row.name } }] : [];
  });
}

export async function getSession(jar: CookieReader): Promise<Session> {
  const held = await guestsOnThisPhone(jar);
  const activeToken = jar.get(ACTIVE_COOKIE)?.value;
  return {
    active: held.find((h) => h.token === activeToken)?.guest ?? null,
    known: held.map((h) => h.guest),
  };
}

// PostgREST turns `*` into `%` before it reaches LIKE and offers no escape for it, so use `_`.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "_");

async function nameTakenError(eventId: string, name: string) {
  // Every suggestion starts with the name, so a prefix match finds all that could be taken.
  const { data, error } = await db()
    .from("guests")
    .select("name")
    .eq("event_id", eventId)
    .ilike("name", `${escapeLike(name)}%`)
    .limit(200);
  // The 409 matters more than perfect suggestions: if the lookup fails, offer them unchecked.
  if (error) console.error("Loading taken names failed", error.code, error.message);
  const taken = new Set((data ?? []).map((g) => g.name.toLowerCase()));
  return new AppError(
    "name_taken",
    409,
    `“${name}” is already used by another guest. Add something to make it yours.`,
    { suggestions: suggestNames(name, taken) },
  );
}

/** Creates a guest from an already validated name and signs this phone in as them. */
export async function createGuest(name: string, jar: CookieJar): Promise<KnownGuest> {
  const event = await getEvent();
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await db()
    .from("guests")
    .insert({ event_id: event.id, name, token_hash: hashToken(token, env().DEVICE_TOKEN_PEPPER) })
    .select("id, name")
    .single();
  if (error?.code === UNIQUE_VIOLATION) throw await nameTakenError(event.id, name);
  if (error) throw new Error(`Creating guest failed: ${error.code} ${error.message}`);

  jar.set(TOKENS_COOKIE, JSON.stringify(addToken(readTokens(jar), token)), cookieOptions());
  jar.set(ACTIVE_COOKIE, token, cookieOptions());
  return { guestId: data.id, name: data.name };
}

/** "Continue as X": only a guest this phone holds a token for can become the active identity. */
export async function activateGuest(guestId: string, jar: CookieJar): Promise<KnownGuest> {
  const match = (await guestsOnThisPhone(jar)).find((h) => h.guest.guestId === guestId);
  if (!match) throw new AppError("unknown_guest", 403, "This phone doesn’t remember that name.");
  jar.set(ACTIVE_COOKIE, match.token, cookieOptions());
  return match.guest;
}

/** "Switch name": the guest, their posts and their token stay; the phone just has no active one. */
export function clearActive(jar: CookieJar): void {
  jar.delete(ACTIVE_COOKIE);
}
