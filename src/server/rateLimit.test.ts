// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { GUEST_JOINS_PER_IP } from "@/lib/domain/limits";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ db: () => mocks.db }));

import { ipHash } from "./ip";
import { throttle } from "./rateLimit";

const ok: DbResult = { data: null, error: null };
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });
const headers = (ip: string) => new Headers({ "x-real-ip": ip });

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

describe("throttle", () => {
  it("counts the request under its scope and the hashed address, never the address itself", async () => {
    const fake = fakeDb([ok]);
    mocks.db = fake.db;
    await throttle("guest_join", headers("9.9.9.9"));
    expect(fake.calls).toEqual([
      {
        table: "rpc",
        method: "rate_limit_hit",
        args: [{ p_scope: "guest_join", p_key: ipHash("9.9.9.9"), p_window_s: 600, p_max: GUEST_JOINS_PER_IP }],
      },
    ]);
  });

  it("follows a limit changed in the environment", async () => {
    vi.stubEnv("GUEST_JOINS_PER_IP", "5000");
    vi.resetModules();
    const fresh = await import("./rateLimit");
    const fake = fakeDb([ok]);
    mocks.db = fake.db;
    await fresh.throttle("guest_join", headers("9.9.9.9"));
    expect(fake.calls[0]!.args[0]).toMatchObject({ p_max: 5000 });
    vi.stubEnv("GUEST_JOINS_PER_IP", "");
  });

  it("keeps rate rows as long as the longest window", async () => {
    const { LONGEST_WINDOW_MS } = await import("./rateLimit");
    expect(LONGEST_WINDOW_MS).toBe(10 * 60_000);
  });

  it("is a 429 with a friendly message over the limit", async () => {
    mocks.db = fakeDb([failure("PT429")]).db;
    await expect(throttle("guest_join", headers("9.9.9.9"))).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      message: expect.stringMatching(/wait a few minutes/),
    });
  });

  it("fails closed when the count cannot be recorded", async () => {
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(throttle("guest_join", headers("9.9.9.9"))).rejects.toThrow(/XX000/);
  });
});
