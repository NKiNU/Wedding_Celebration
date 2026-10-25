import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJar } from "../../tests/fixtures/cookies";
import { validEnv } from "../../tests/fixtures/env";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { AppError } from "./http";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./event", () => ({
  getEvent: async () => ({ id: "event-1", groom_name: "Groom", bride_name: "Bride" }),
}));

import {
  activateGuest,
  clearActive,
  createGuest,
  getSession,
  hashToken,
  readTokens,
  requireGuest,
} from "./identity";

const PEPPER = validEnv.DEVICE_TOKEN_PEPPER;
const ok = (data: unknown): DbResult => ({ data, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });

function stubDb(queue: DbResult[]) {
  const fake = fakeDb(queue);
  mocks.db = fake.db;
  return fake.calls;
}

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
beforeEach(() => {
  mocks.db = null;
});

describe("hashToken", () => {
  it("is a stable sha256 hex digest that depends on the pepper", () => {
    const a = hashToken("token", PEPPER);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("token", PEPPER)).toBe(a);
    expect(hashToken("token", "other-pepper")).not.toBe(a);
  });
});

describe("readTokens", () => {
  it("returns the token list from the cookie", () => {
    expect(readTokens(fakeJar({ wm_tokens: '["a","b"]' }))).toEqual(["a", "b"]);
  });

  it.each([undefined, "not json", '{"a":1}', '["a",1]', JSON.stringify(Array(6).fill("t"))])(
    "treats %s as no tokens",
    (raw) => {
      const jar = fakeJar(raw === undefined ? {} : { wm_tokens: raw });
      expect(readTokens(jar)).toEqual([]);
    },
  );
});

describe("createGuest", () => {
  it("stores only the hash of a fresh token and remembers the raw token in httpOnly cookies", async () => {
    const calls = stubDb([ok({ id: "g1", name: "Ali" })]);
    const jar = fakeJar();

    const guest = await createGuest("Ali", jar);

    expect(guest).toEqual({ guestId: "g1", name: "Ali" });
    const insert = calls.find((c) => c.method === "insert")!;
    const row = insert.args[0] as { event_id: string; name: string; token_hash: string };
    const stored = JSON.parse(jar.get("wm_tokens")!.value) as string[];
    expect(stored).toHaveLength(1);
    expect(row).toEqual({
      event_id: "event-1",
      name: "Ali",
      token_hash: hashToken(stored[0], PEPPER),
    });
    expect(row.token_hash).not.toBe(stored[0]);
    expect(jar.get("wm_active")!.value).toBe(stored[0]);
    for (const cookie of jar.sets) {
      expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
      expect(cookie.options.maxAge).toBe(60 * 60 * 24 * 365);
    }
  });

  it("marks cookies Secure in production only, so a phone can test over plain http on the LAN", async () => {
    const secureFlags = async (nodeEnv: string) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      stubDb([ok({ id: "g1", name: "Ali" })]);
      const jar = fakeJar();
      await createGuest("Ali", jar);
      return jar.sets.map((c) => c.options.secure);
    };
    expect(await secureFlags("production")).toEqual([true, true]);
    expect(await secureFlags("development")).toEqual([false, false]);
    vi.stubEnv("NODE_ENV", "test");
  });

  it("issues a different token each time", async () => {
    stubDb([ok({ id: "g1", name: "Ali" }), ok({ id: "g2", name: "Siti" })]);
    const jar = fakeJar();
    await createGuest("Ali", jar);
    await createGuest("Siti", jar);
    const [first, second] = JSON.parse(jar.get("wm_tokens")!.value) as string[];
    expect(first).not.toBe(second);
  });

  it("keeps at most five tokens, dropping the oldest", async () => {
    stubDb([ok({ id: "g6", name: "Six" })]);
    const jar = fakeJar({ wm_tokens: JSON.stringify(["t1", "t2", "t3", "t4", "t5"]) });
    await createGuest("Six", jar);
    const stored = JSON.parse(jar.get("wm_tokens")!.value) as string[];
    expect(stored).toHaveLength(5);
    expect(stored.slice(0, 4)).toEqual(["t2", "t3", "t4", "t5"]);
  });

  it("answers 409 with free suggestions when the name is taken, and sets no cookies", async () => {
    const calls = stubDb([failure("23505"), ok([{ name: "Ali" }, { name: "ali 2" }])]);
    const jar = fakeJar();

    const error = await createGuest("Ali", jar).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 409,
      code: "name_taken",
      message: "“Ali” is already used by another guest. Add something to make it yours.",
      details: { suggestions: ["Ali & family", "Ali 3"] },
    });
    expect(jar.sets).toEqual([]);
    const lookup = calls.find((c) => c.method === "ilike")!;
    expect(lookup.args).toEqual(["name", "Ali%"]);
  });

  it("escapes LIKE wildcards in the name when looking for taken suggestions", async () => {
    const calls = stubDb([failure("23505"), ok([])]);
    await createGuest("50%_off", fakeJar()).catch(() => {});
    expect(calls.find((c) => c.method === "ilike")!.args).toEqual(["name", "50\\%\\_off%"]);
  });

  it("keeps PostgREST's * wildcard from widening the prefix search", async () => {
    const calls = stubDb([failure("23505"), ok([])]);
    await createGuest("A*", fakeJar()).catch(() => {});
    expect(calls.find((c) => c.method === "ilike")!.args).toEqual(["name", "A_%"]);
  });

  it("still answers 409 when the taken-names lookup fails, logging only the error code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    stubDb([failure("23505"), { data: null, error: { code: "08006", message: "down" } }]);
    await expect(createGuest("Ali", fakeJar())).rejects.toMatchObject({ status: 409 });
    expect(log).toHaveBeenCalledWith("Loading taken names failed", "08006", "down");
    log.mockRestore();
  });

  it("surfaces any other database failure as an unexpected error", async () => {
    stubDb([failure("08006")]);
    await expect(createGuest("Ali", fakeJar())).rejects.toThrow(/08006/);
  });
});

describe("getSession", () => {
  const tokens = ["tok-a", "tok-b"];
  const rows = [
    { id: "g-b", name: "Beta", token_hash: hashToken("tok-b", PEPPER) },
    { id: "g-a", name: "Alpha", token_hash: hashToken("tok-a", PEPPER) },
  ];

  it("is empty, without touching the database, when the phone has no tokens", async () => {
    const calls = stubDb([]);
    expect(await getSession(fakeJar())).toEqual({ active: null, known: [] });
    expect(calls).toEqual([]);
  });

  it("lists this phone's guests in cookie order and resolves the active one", async () => {
    stubDb([ok(rows)]);
    const jar = fakeJar({ wm_tokens: JSON.stringify(tokens), wm_active: "tok-b" });
    expect(await getSession(jar)).toEqual({
      active: { guestId: "g-b", name: "Beta" },
      known: [
        { guestId: "g-a", name: "Alpha" },
        { guestId: "g-b", name: "Beta" },
      ],
    });
  });

  it("has no active guest after Switch name", async () => {
    stubDb([ok(rows)]);
    const jar = fakeJar({ wm_tokens: JSON.stringify(tokens) });
    expect((await getSession(jar)).active).toBeNull();
  });

  it("ignores an active token the phone does not hold, and tokens with no guest row", async () => {
    stubDb([ok([rows[1]])]);
    const jar = fakeJar({ wm_tokens: JSON.stringify(tokens), wm_active: "stolen-token" });
    expect(await getSession(jar)).toEqual({
      active: null,
      known: [{ guestId: "g-a", name: "Alpha" }],
    });
  });

  it("scopes the lookup to this event and only the hashes it holds", async () => {
    const calls = stubDb([ok(rows)]);
    await getSession(fakeJar({ wm_tokens: JSON.stringify(tokens) }));
    expect(calls.find((c) => c.method === "eq")!.args).toEqual(["event_id", "event-1"]);
    expect(calls.find((c) => c.method === "in")!.args).toEqual([
      "token_hash",
      tokens.map((t) => hashToken(t, PEPPER)),
    ]);
  });

  it("surfaces a database failure as an unexpected error", async () => {
    stubDb([failure("08006")]);
    await expect(getSession(fakeJar({ wm_tokens: '["t"]' }))).rejects.toThrow(/08006/);
  });
});

describe("activateGuest", () => {
  const rows = [{ id: "g-a", name: "Alpha", token_hash: hashToken("tok-a", PEPPER) }];

  it("makes a guest of this phone the active identity", async () => {
    stubDb([ok(rows)]);
    const jar = fakeJar({ wm_tokens: '["tok-a"]' });
    expect(await activateGuest("g-a", jar)).toEqual({ guestId: "g-a", name: "Alpha" });
    expect(jar.get("wm_active")!.value).toBe("tok-a");
    expect(jar.sets[0].options).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });

  it("refuses a guest this phone holds no token for, whatever id the client sends", async () => {
    stubDb([ok(rows)]);
    const jar = fakeJar({ wm_tokens: '["tok-a"]' });
    await expect(activateGuest("someone-else", jar)).rejects.toMatchObject({
      status: 403,
      code: "unknown_guest",
    });
    expect(jar.sets).toEqual([]);
  });
});

describe("clearActive", () => {
  it("forgets the active identity but keeps the phone's tokens", () => {
    const jar = fakeJar({ wm_tokens: '["tok-a"]', wm_active: "tok-a" });
    clearActive(jar);
    expect(jar.has("wm_active")).toBe(false);
    expect(jar.has("wm_tokens")).toBe(true);
  });
});

describe("requireGuest", () => {
  it("returns the guest whose token hash matches the active cookie, within this event", async () => {
    const calls = stubDb([ok({ id: "g1", name: "Ali" })]);

    const guest = await requireGuest(fakeJar({ wm_active: "tok" }));

    expect(guest).toEqual({ id: "g1", name: "Ali", eventId: "event-1" });
    const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["event_id", "event-1"]);
    expect(eqs).toContainEqual(["token_hash", hashToken("tok", PEPPER)]);
  });

  it("is a 401 without an active cookie, and does not query", async () => {
    const calls = stubDb([]);
    await expect(requireGuest(fakeJar())).rejects.toMatchObject({ status: 401, code: "no_session" });
    expect(calls).toHaveLength(0);
  });

  it("is a 401 when no guest of this event has that token", async () => {
    stubDb([ok(null)]);
    await expect(requireGuest(fakeJar({ wm_active: "forged" }))).rejects.toBeInstanceOf(AppError);
  });

  it("fails loudly when the lookup itself fails", async () => {
    stubDb([failure("XX000")]);
    await expect(requireGuest(fakeJar({ wm_active: "tok" }))).rejects.toThrow(/XX000/);
  });
});
