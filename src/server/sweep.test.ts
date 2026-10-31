// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeR2 } from "../../tests/fixtures/r2";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";

const mocks = vi.hoisted(() => ({ db: null as unknown, r2: null as unknown }));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./r2", () => ({ r2: () => mocks.r2 }));

import { assertCronRequest, purgeAdminAttempts, purgeRateAttempts, sweepUploads } from "./sweep";

const ok = (data: unknown): DbResult => ({ data, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });
const row = (id: string) => ({
  post_id: id,
  files: [{ role: "main", position: 0, mime: "image/jpeg", bytes: 3, key: `events/e1/${id}/0.jpg` }],
});

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

describe("assertCronRequest", () => {
  it("accepts exactly the bearer secret", () => {
    expect(() => assertCronRequest(`Bearer ${validEnv.CRON_SECRET}`)).not.toThrow();
  });

  it.each([null, "", "Bearer wrong", validEnv.CRON_SECRET, `bearer ${validEnv.CRON_SECRET}`])(
    "refuses %j",
    (header) => {
      expect(() => assertCronRequest(header)).toThrowError(expect.objectContaining({ status: 401 }));
    },
  );
});

describe("sweepUploads", () => {
  it("deletes the objects and then the row of every expired, unconsumed intent", async () => {
    const fake = fakeDb([ok([row("a"), row("b")]), ok(null), ok(null)]);
    const r2 = fakeR2();
    mocks.db = fake.db;
    mocks.r2 = r2.r2;

    const result = await sweepUploads(new Date("2026-10-25T12:00:00Z"));

    expect(result).toEqual({ removed: 2, failed: 0 });
    expect(r2.deleted.sort()).toEqual(["events/e1/a/0.jpg", "events/e1/b/0.jpg"]);
    expect(fake.calls).toContainEqual(expect.objectContaining({ method: "is", args: ["consumed_at", null] }));
    expect(fake.calls).toContainEqual(expect.objectContaining({ method: "lt", args: ["expires_at", "2026-10-25T12:00:00.000Z"] }));
    expect(fake.calls.filter((c) => c.method === "delete")).toHaveLength(2);
  });

  it("keeps the row of an intent whose objects could not be deleted, and still sweeps the rest", async () => {
    const fake = fakeDb([ok([row("a"), row("b")]), ok(null)]);
    mocks.db = fake.db;
    mocks.r2 = {
      deleteMany: async (keys: string[]) => {
        if (keys[0]!.includes("/a/")) throw new Error("r2 down");
      },
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sweepUploads()).toEqual({ removed: 1, failed: 1 });
    expect(fake.calls.filter((c) => c.method === "delete")).toHaveLength(1);
    quiet.mockRestore();
  });

  it("does nothing when nothing expired", async () => {
    mocks.db = fakeDb([ok([])]).db;
    mocks.r2 = fakeR2().r2;
    expect(await sweepUploads()).toEqual({ removed: 0, failed: 0 });
  });

  it("fails loudly when the lookup fails", async () => {
    mocks.db = fakeDb([failure("XX000")]).db;
    mocks.r2 = fakeR2().r2;
    await expect(sweepUploads()).rejects.toThrow(/XX000/);
  });
});

describe("purgeAdminAttempts", () => {
  it("deletes attempts older than the throttle window", async () => {
    const fake = fakeDb([ok(null)]);
    mocks.db = fake.db;
    await purgeAdminAttempts(new Date("2026-10-26T12:00:00Z"));
    expect(fake.calls.map((c) => [c.table, c.method])).toEqual([["admin_attempts", "delete"], ["admin_attempts", "lt"]]);
    expect(fake.calls[1]!.args).toEqual(["at", "2026-10-26T11:45:00.000Z"]);
  });

  it("only logs when it fails: the sweep itself must not fail over it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(purgeAdminAttempts()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("purgeRateAttempts", () => {
  it("deletes counts older than the longest rate window", async () => {
    const fake = fakeDb([ok(null)]);
    mocks.db = fake.db;
    await purgeRateAttempts(new Date("2026-10-26T12:00:00Z"));
    expect(fake.calls.map((c) => [c.table, c.method])).toEqual([["rate_attempts", "delete"], ["rate_attempts", "lt"]]);
    expect(fake.calls[1]!.args).toEqual(["at", "2026-10-26T11:50:00.000Z"]);
  });

  it("only logs when it fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(purgeRateAttempts()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
