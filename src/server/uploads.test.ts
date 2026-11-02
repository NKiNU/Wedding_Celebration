import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeR2 } from "../../tests/fixtures/r2";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { BYTES_PER_HOUR, INTENT_TTL_MS, MAX_EVENT_MB, MB, POSTS_PER_HOUR, RATE_WINDOW_MS } from "@/lib/domain/limits";
import type { UploadFile } from "@/lib/domain/uploads";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  r2: null as unknown,
  event: { id: "e1", uploads_open: true },
}));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./r2", () => ({ r2: () => mocks.r2 }));
vi.mock("./event", () => ({ getEvent: async () => mocks.event }));

import { assertUploadsOpen, cancelUploadIntent, createUploadIntent, limitArgs, storedFilesOf } from "./uploads";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const POST_ID = "b0000000-0000-4000-8000-000000000001";
const ok = (data: unknown): DbResult => ({ data, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });

const photo: UploadFile[] = [
  { role: "main", position: 0, mime: "image/jpeg", bytes: 2 * MB, width: 2048, height: 1536 },
  { role: "thumb", position: 0, mime: "image/jpeg", bytes: 40_000 },
];

function setup(queue: DbResult[]) {
  const fake = fakeDb(queue);
  const r2 = fakeR2();
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

describe("limitArgs", () => {
  it("hands the named limits and the start of the window to the database function", () => {
    const args = limitArgs();
    expect(args.p_max_posts).toBe(POSTS_PER_HOUR);
    expect(args.p_max_bytes).toBe(BYTES_PER_HOUR);
    expect(Date.now() - Date.parse(args.p_since)).toBeGreaterThanOrEqual(RATE_WINDOW_MS - 1000);
    expect(Date.now() - Date.parse(args.p_since)).toBeLessThanOrEqual(RATE_WINDOW_MS + 1000);
  });
});

describe("storedFilesOf", () => {
  it("parses stored files and treats malformed rows as a server fault, not a guest error", () => {
    expect(storedFilesOf([{ role: "main", position: 0, mime: "image/jpeg", bytes: 1, key: "k" }])).toHaveLength(1);
    expect(() => storedFilesOf([{ role: "main" }])).toThrow("malformed");
  });
});

describe("createUploadIntent", () => {
  it("spends the allowance and stores the intent in one database call, with server-built keys", async () => {
    const { calls, presigned } = setup([ok(null)]);

    const result = await createUploadIntent(GUEST, photo);

    const call = calls.find((c) => c.table === "rpc" && c.method === "create_upload_intent")!;
    const args = call.args[0] as Record<string, unknown> & { p_files: { key: string }[] };
    expect(args).toMatchObject({
      p_post_id: result.postId,
      p_event_id: "e1",
      p_guest_id: "g1",
      p_max_posts: POSTS_PER_HOUR,
      p_max_bytes: BYTES_PER_HOUR,
    });
    expect(args.p_files.map((f) => f.key)).toEqual([
      `events/e1/${result.postId}/0.jpg`,
      `events/e1/${result.postId}/0_thumb.jpg`,
    ]);
    const ttl = Date.parse(args.p_expires_at as string) - Date.now();
    expect(ttl).toBeGreaterThan(INTENT_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(INTENT_TTL_MS);
    expect(presigned).toEqual([
      { key: args.p_files[0]!.key, mime: "image/jpeg", bytes: 2 * MB },
      { key: args.p_files[1]!.key, mime: "image/jpeg", bytes: 40_000 },
    ]);
    expect(result.uploads).toEqual([
      { role: "main", position: 0, url: `https://r2.test/${args.p_files[0]!.key}` },
      { role: "thumb", position: 0, url: `https://r2.test/${args.p_files[1]!.key}` },
    ]);
  });

  it("refuses while uploads are closed, before touching the database", async () => {
    mocks.event = { id: "e1", uploads_open: false };
    const { calls } = setup([]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it("is a 429 when the database says the hour is used up, and presigns nothing", async () => {
    const { presigned } = setup([failure("PT429")]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    expect(presigned).toHaveLength(0);
  });

  it("passes the event storage cap in bytes", async () => {
    const { calls } = setup([ok(null)]);
    await createUploadIntent(GUEST, photo);
    const args = calls.find((c) => c.method === "create_upload_intent")!.args[0] as Record<string, unknown>;
    expect(args.p_max_event_bytes).toBe(MAX_EVENT_MB * MB);
  });

  it("is a 507 when the event's storage is full, and presigns nothing", async () => {
    const { presigned } = setup([failure("PT507")]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toMatchObject({ status: 507, code: "storage_full" });
    expect(presigned).toHaveLength(0);
  });

  it("fails loudly on any other database error", async () => {
    setup([failure("XX000")]);
    await expect(createUploadIntent(GUEST, photo)).rejects.toThrow(/XX000/);
  });

  it("releases the intent again when presigning fails", async () => {
    const { calls } = setup([ok(null), ok(null)]);
    mocks.r2 = { presignPut: async () => Promise.reject(new Error("no keys")) };
    await expect(createUploadIntent(GUEST, photo)).rejects.toThrow("no keys");
    expect(calls.filter((c) => c.method === "delete")).toHaveLength(1);
  });
});

describe("cancelUploadIntent", () => {
  const files = [
    { role: "main", position: 0, mime: "image/jpeg", bytes: 5, key: "events/e1/p/0.jpg" },
    { role: "thumb", position: 0, mime: "image/jpeg", bytes: 5, key: "events/e1/p/0_thumb.jpg" },
  ];

  it("marks the intent cancelled, deletes its objects, and keeps the row so it still counts", async () => {
    const { calls, deleted } = setup([ok([{ files }])]);

    await cancelUploadIntent(GUEST, POST_ID);

    expect(deleted).toEqual(["events/e1/p/0.jpg", "events/e1/p/0_thumb.jpg"]);
    expect(calls.find((c) => c.method === "update")!.args[0]).toHaveProperty("cancelled_at");
    expect(calls.some((c) => c.method === "delete")).toBe(false);
    const claim = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(claim).toContainEqual(["guest_id", "g1"]);
    expect(calls).toContainEqual(expect.objectContaining({ method: "is", args: ["consumed_at", null] }));
    expect(calls).toContainEqual(expect.objectContaining({ method: "is", args: ["cancelled_at", null] }));
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

  it("is fine to cancel twice", async () => {
    const { deleted } = setup([ok([]), ok({ consumed_at: null })]);
    await expect(cancelUploadIntent(GUEST, POST_ID)).resolves.toBeUndefined();
    expect(deleted).toHaveLength(0);
  });

  it("still succeeds when R2 cannot delete right now: the sweep removes the objects later", async () => {
    setup([ok([{ files }])]);
    mocks.r2 = { deleteMany: async () => Promise.reject(new Error("r2 down")) };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(cancelUploadIntent(GUEST, POST_ID)).resolves.toBeUndefined();
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("fails loudly when the claim query fails", async () => {
    setup([failure("XX000")]);
    await expect(cancelUploadIntent(GUEST, POST_ID)).rejects.toThrow(/XX000/);
  });
});
