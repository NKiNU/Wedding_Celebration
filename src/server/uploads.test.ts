import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeR2 } from "../../tests/fixtures/r2";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { INTENT_TTL_MS, MB, POSTS_PER_HOUR } from "@/lib/domain/limits";
import type { UploadFile } from "@/lib/domain/uploads";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  r2: null as unknown,
  event: { id: "e1", uploads_open: true },
}));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./r2", () => ({ r2: () => mocks.r2 }));
vi.mock("./event", () => ({ getEvent: async () => mocks.event }));

import { assertUploadsOpen, cancelUploadIntent, createUploadIntent, discardIntent } from "./uploads";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const POST_ID = "b0000000-0000-4000-8000-000000000001";
const ok = (data: unknown, count?: number): DbResult => ({ data, count, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });
const intentRow = (bytes: number) => ({ files: [{ role: "main", position: 0, mime: "image/jpeg", bytes, key: "k" }] });

const photo: UploadFile[] = [
  { role: "main", position: 0, mime: "image/jpeg", bytes: 2 * MB, width: 2048, height: 1536 },
  { role: "thumb", position: 0, mime: "image/jpeg", bytes: 40_000 },
];

function setup(queue: DbResult[], objects = {}) {
  const fake = fakeDb(queue);
  const r2 = fakeR2(objects);
  mocks.db = fake.db;
  mocks.r2 = r2.r2;
  return { ...fake, ...r2 };
}

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
beforeEach(() => {
  mocks.event = { id: "e1", uploads_open: true };
});

describe("assertUploadsOpen", () => {
  it("is a 403 while the admin has closed uploads", () => {
    expect(() => assertUploadsOpen({ uploads_open: true })).not.toThrow();
    expect(() => assertUploadsOpen({ uploads_open: false })).toThrowError(
      expect.objectContaining({ status: 403, code: "uploads_closed" }),
    );
  });
});

describe("createUploadIntent", () => {
  it("stores an intent with server-built keys and returns one presigned URL per file", async () => {
    const { calls, presigned } = setup([ok([]), ok(null, 0), ok(null)]);

    const result = await createUploadIntent(GUEST, photo);

    const insert = calls.find((c) => c.table === "upload_intents" && c.method === "insert")!;
    const row = insert.args[0] as Record<string, unknown> & { files: { key: string }[] };
    expect(row).toMatchObject({ post_id: result.postId, event_id: "e1", guest_id: "g1" });
    expect(row.files.map((f) => f.key)).toEqual([
      `events/e1/${result.postId}/0.jpg`,
      `events/e1/${result.postId}/0_thumb.jpg`,
    ]);
    const ttl = Date.parse(row.expires_at as string) - Date.now();
    expect(ttl).toBeGreaterThan(INTENT_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(INTENT_TTL_MS);
    expect(presigned).toEqual([
      { key: row.files[0]!.key, mime: "image/jpeg", bytes: 2 * MB },
      { key: row.files[1]!.key, mime: "image/jpeg", bytes: 40_000 },
    ]);
    expect(result.uploads).toEqual([
      { role: "main", position: 0, url: `https://r2.test/${row.files[0]!.key}` },
      { role: "thumb", position: 0, url: `https://r2.test/${row.files[1]!.key}` },
    ]);
  });

  it("refuses while uploads are closed, before touching the database", async () => {
    mocks.event = { id: "e1", uploads_open: false };
    const { calls } = setup([]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it("stops the 31st post of the hour, counting unfinished intents and wishes", async () => {
    const intents = Array(POSTS_PER_HOUR - 5).fill(intentRow(10));
    setup([ok(intents), ok(null, 5)]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("stops a request that would pass 200 MB with uploads still in flight", async () => {
    setup([ok([intentRow(99 * MB), intentRow(99 * MB)]), ok(null, 0)]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 429 });
  });

  it("lets the 30th post through", async () => {
    setup([ok(Array(POSTS_PER_HOUR - 1).fill(intentRow(10))), ok(null, 0), ok(null)]);
    await expect(createUploadIntent(GUEST, photo)).resolves.toHaveProperty("postId");
  });

  it("fails when the intent cannot be stored, and presigns nothing", async () => {
    const { presigned } = setup([ok([]), ok(null, 0), failure("XX000")]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toThrow(/XX000/);
    expect(presigned).toHaveLength(0);
  });

  it("fails loudly when the usage lookup fails", async () => {
    setup([failure("XX000"), ok(null, 0)]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toThrow(/XX000/);
  });
});

describe("cancelUploadIntent", () => {
  const files = [
    { role: "main", position: 0, mime: "image/jpeg", bytes: 5, key: "events/e1/p/0.jpg" },
    { role: "thumb", position: 0, mime: "image/jpeg", bytes: 5, key: "events/e1/p/0_thumb.jpg" },
  ];

  it("expires the intent, deletes its objects, then its row", async () => {
    const { calls, deleted } = setup([ok([{ files }]), ok(null)]);

    await cancelUploadIntent(GUEST, POST_ID);

    expect(deleted).toEqual(["events/e1/p/0.jpg", "events/e1/p/0_thumb.jpg"]);
    expect(calls.map((c) => c.method).filter((m) => ["update", "delete"].includes(m))).toEqual(["update", "delete"]);
    expect(calls.find((c) => c.method === "update")!.args[0]).toHaveProperty("expires_at");
    const claim = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(claim).toContainEqual(["guest_id", "g1"]);
    expect(calls).toContainEqual(expect.objectContaining({ method: "is", args: ["consumed_at", null] }));
  });

  it("refuses once the post exists, and deletes nothing", async () => {
    const { deleted } = setup([ok([]), ok({ consumed_at: "2026-10-25T10:00:00Z" })]);
    await expect(cancelUploadIntent(GUEST, POST_ID)).rejects.toMatchObject({ status: 409, code: "already_posted" });
    expect(deleted).toHaveLength(0);
  });

  it("is a 404 for an intent that is not this guest's", async () => {
    const { deleted } = setup([ok([]), ok(null)]);
    await expect(cancelUploadIntent(GUEST, POST_ID)).rejects.toMatchObject({ status: 404 });
    expect(deleted).toHaveLength(0);
  });

  it("keeps the row for the sweep when R2 fails", async () => {
    const { calls } = setup([ok([{ files }])]);
    mocks.r2 = { deleteMany: async () => Promise.reject(new Error("r2 down")) };
    await expect(cancelUploadIntent(GUEST, POST_ID)).rejects.toThrow("r2 down");
    expect(calls.some((c) => c.method === "delete")).toBe(false);
  });

  it("fails loudly when the claim query fails", async () => {
    setup([failure("XX000")]);
    await expect(cancelUploadIntent(GUEST, POST_ID)).rejects.toThrow(/XX000/);
  });
});

describe("discardIntent", () => {
  it("deletes the objects, then the row", async () => {
    const { calls, deleted } = setup([ok(null)]);
    await discardIntent(POST_ID, ["a", "b"]);
    expect(deleted).toEqual(["a", "b"]);
    expect(calls.some((c) => c.method === "delete")).toBe(true);
  });

  it("fails loudly when the row cannot be deleted", async () => {
    setup([failure("XX000")]);
    await expect(discardIntent(POST_ID, [])).rejects.toThrow(/XX000/);
  });
});
