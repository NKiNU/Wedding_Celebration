import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeR2 } from "../../tests/fixtures/r2";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { MB, POSTS_PER_HOUR } from "@/lib/domain/limits";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  r2: null as unknown,
  event: { id: "e1", uploads_open: true },
}));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./r2", () => ({ r2: () => mocks.r2 }));
vi.mock("./event", () => ({ getEvent: async () => mocks.event }));

import { createMediaPost, createWish } from "./posts";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const POST_ID = "b0000000-0000-4000-8000-000000000001";
const ok = (data: unknown, count?: number): DbResult => ({ data, count, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });

const K = (name: string) => `events/e1/${POST_ID}/${name}`;
const file = (role: string, position: number, name: string, mime: string, bytes: number, extra = {}) => ({
  role, position, mime, bytes, key: K(name), ...extra,
});
const photoFiles = [
  file("main", 0, "0.jpg", "image/jpeg", 2 * MB, { width: 2048, height: 1536 }),
  file("thumb", 0, "0_thumb.jpg", "image/jpeg", 30_000),
  file("main", 1, "1.jpg", "image/jpeg", 1 * MB),
  file("thumb", 1, "1_thumb.jpg", "image/jpeg", 20_000),
];
const videoFiles = [
  file("main", 0, "0.mp4", "video/mp4", 20 * MB, { width: 1280, height: 720, durationS: 24 }),
  file("poster", 0, "0_poster.jpg", "image/jpeg", 9000),
];
const uploaded = (files: typeof photoFiles) =>
  Object.fromEntries(files.map((f) => [f.key, { bytes: f.bytes, mime: f.mime }]));
const intent = (files: unknown[], over = {}) => ok({ files, consumed_at: null, ...over });

function setup(queue: DbResult[], objects = {}) {
  const fake = fakeDb(queue);
  const r2 = fakeR2(objects);
  mocks.db = fake.db;
  mocks.r2 = r2.r2;
  return { ...fake, ...r2 };
}
const rpcCall = (calls: { table: string; method: string; args: unknown[] }[]) =>
  calls.find((c) => c.table === "rpc")!.args[0] as Record<string, unknown>;

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
beforeEach(() => {
  mocks.event = { id: "e1", uploads_open: true };
});

describe("createWish", () => {
  it("inserts a wish for this guest and returns its id", async () => {
    const { calls } = setup([ok([]), ok(null, 0), ok({ id: POST_ID })]);

    expect(await createWish(GUEST, "Selamat pengantin baru!")).toEqual({ id: POST_ID });

    const insert = calls.find((c) => c.method === "insert")!;
    expect(insert.table).toBe("posts");
    expect(insert.args[0]).toEqual({ event_id: "e1", guest_id: "g1", type: "wish", wish_text: "Selamat pengantin baru!" });
  });

  it("is a 403 while uploads are closed", async () => {
    mocks.event = { id: "e1", uploads_open: false };
    setup([]);
    await expect(createWish(GUEST, "Congratulations")).rejects.toMatchObject({ status: 403 });
  });

  it("is a 429 at the hourly post limit", async () => {
    setup([ok([]), ok(null, POSTS_PER_HOUR)]);
    await expect(createWish(GUEST, "Congratulations")).rejects.toMatchObject({ status: 429 });
  });

  it("fails loudly when the insert fails", async () => {
    setup([ok([]), ok(null, 0), failure("23514")]);
    await expect(createWish(GUEST, "Congratulations")).rejects.toThrow(/23514/);
  });
});

describe("createMediaPost", () => {
  it("derives an album from the verified files and passes exact media to the database function", async () => {
    const { calls } = setup([intent(photoFiles), ok(null)], uploaded(photoFiles));

    expect(await createMediaPost(GUEST, POST_ID, "Akad nikah")).toEqual({ id: POST_ID });

    expect(rpcCall(calls)).toEqual({
      p_post_id: POST_ID,
      p_guest_id: "g1",
      p_type: "album",
      p_caption: "Akad nikah",
      p_media: [
        { position: 0, kind: "image", path: K("0.jpg"), thumb_path: K("0_thumb.jpg"), poster_path: null, width: 2048, height: 1536, duration_s: null, bytes: 2 * MB, mime: "image/jpeg" },
        { position: 1, kind: "image", path: K("1.jpg"), thumb_path: K("1_thumb.jpg"), poster_path: null, width: null, height: null, duration_s: null, bytes: 1 * MB, mime: "image/jpeg" },
      ],
    });
  });

  it("is a video with its poster and duration", async () => {
    const { calls } = setup([intent(videoFiles), ok(null)], uploaded(videoFiles));

    await createMediaPost(GUEST, POST_ID, null);

    const args = rpcCall(calls);
    expect(args.p_type).toBe("video");
    expect(args.p_media).toEqual([
      { position: 0, kind: "video", path: K("0.mp4"), thumb_path: null, poster_path: K("0_poster.jpg"), width: 1280, height: 720, duration_s: 24, bytes: 20 * MB, mime: "video/mp4" },
    ]);
  });

  it("takes the type from the intent, whatever the request claims", async () => {
    const one = photoFiles.slice(0, 2);
    const { calls } = setup([intent(one), ok(null)], uploaded(one));
    await createMediaPost(GUEST, POST_ID, null);
    expect(rpcCall(calls).p_type).toBe("photo");
  });

  it("is a 404 when the intent is not this guest's", async () => {
    setup([ok(null)]);
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 404, code: "intent_not_found" });
  });

  it("answers a repeated submit with the existing post, without touching R2 or the function", async () => {
    const { calls } = setup([intent(photoFiles, { consumed_at: "2026-10-25T10:00:00Z" })]);
    expect(await createMediaPost(GUEST, POST_ID, null)).toEqual({ id: POST_ID });
    expect(calls.some((c) => c.table === "rpc")).toBe(false);
  });

  it("is a 403 while uploads are closed", async () => {
    mocks.event = { id: "e1", uploads_open: false };
    setup([intent(photoFiles)], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 403 });
  });

  it("is a 400 when a file never arrived", async () => {
    const { calls } = setup([intent(photoFiles)], uploaded(photoFiles.slice(0, 3)));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 400, code: "upload_incomplete" });
    expect(calls.some((c) => c.table === "rpc")).toBe(false);
  });

  it("is a 400 when a stored file has another size or type than declared", async () => {
    const wrongSize = { ...uploaded(photoFiles), [K("0.jpg")]: { bytes: 5, mime: "image/jpeg" } };
    setup([intent(photoFiles)], wrongSize);
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ code: "upload_incomplete" });

    const wrongType = { ...uploaded(photoFiles), [K("0.jpg")]: { bytes: 2 * MB, mime: "text/html" } };
    setup([intent(photoFiles)], wrongType);
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ code: "upload_incomplete" });
  });

  it("accepts a content type that carries parameters or other casing", async () => {
    const stored = { ...uploaded(photoFiles), [K("0.jpg")]: { bytes: 2 * MB, mime: "Image/JPEG; charset=binary" } };
    setup([intent(photoFiles), ok(null)], stored);
    await expect(createMediaPost(GUEST, POST_ID, null)).resolves.toEqual({ id: POST_ID });
  });

  it("treats a concurrent double submit (PT409) as success", async () => {
    setup([intent(photoFiles), failure("PT409")], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).resolves.toEqual({ id: POST_ID });
  });

  it("cleans up and answers 410 when the intent expired (PT410)", async () => {
    const { deleted, calls } = setup([intent(photoFiles), failure("PT410"), ok(null)], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 410, code: "intent_expired" });
    expect(deleted).toHaveLength(photoFiles.length);
    expect(calls.some((c) => c.method === "delete")).toBe(true);
  });

  it("maps PT404 to 404 and PT400 to 400, and other errors to a plain failure", async () => {
    setup([intent(photoFiles), failure("PT404")], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 404 });
    setup([intent(photoFiles), failure("PT400")], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ status: 400, code: "invalid_media" });
    setup([intent(photoFiles), failure("XX000")], uploaded(photoFiles));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toThrow(/XX000/);
  });

  it("keeps the objects when the function fails for another reason", async () => {
    const { store } = setup([intent(photoFiles), failure("XX000")], uploaded(photoFiles));
    await createMediaPost(GUEST, POST_ID, null).catch(() => {});
    expect(store.size).toBe(photoFiles.length);
  });

  it("is a 400 when the files do not make a post", async () => {
    const odd = [file("main", 0, "0.jpg", "image/gif", 10)];
    setup([intent(odd)], uploaded(odd));
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("fails loudly when the intent lookup fails", async () => {
    setup([failure("XX000")]);
    await expect(createMediaPost(GUEST, POST_ID, null)).rejects.toThrow(/XX000/);
  });
});
