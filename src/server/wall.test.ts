import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeDb } from "../../tests/fixtures/supabase";
import { encodeCursor } from "@/lib/domain/posts";
import { MY_POSTS_MAX, PAGE_SIZE, TICKER_WISHES } from "@/lib/domain/limits";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./event", () => ({ getEvent: async () => ({ id: "e1" }) }));

import { AppError } from "./http";
import { getLatestWishes, getMyPosts, getPost, getWallCounts, getWallPage } from "./wall";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

const STAMP = "2026-10-25T10:00:00.123456+00:00";
const ID = "b0000000-0000-4000-8000-000000000001";

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `b0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  type: "photo",
  caption: "The cake!",
  wish_text: null,
  created_at: STAMP,
  guest_id: "a1",
  guests: { name: "Ali" },
  post_media: [
    {
      kind: "image",
      path: "events/e1/p/0.jpg",
      thumb_path: "events/e1/p/0_thumb.jpg",
      poster_path: null,
      duration_s: null,
    },
  ],
  ...over,
});

describe("getWallPage", () => {
  it("returns visible posts of this event newest first, with media urls on the media domain", async () => {
    const { db, calls } = fakeDb([{ data: [row(1)], error: null }]);
    mocks.db = db;

    const page = await getWallPage(null);

    expect(page.nextCursor).toBeNull();
    expect(page.posts[0]).toEqual({
      id: row(1).id,
      type: "photo",
      caption: "The cake!",
      wishText: null,
      createdAt: STAMP,
      guestId: "a1",
      author: "Ali",
      media: [
        {
          kind: "image",
          url: "https://media.example.com/events/e1/p/0.jpg",
          thumbUrl: "https://media.example.com/events/e1/p/0_thumb.jpg",
          posterUrl: null,
          durationS: null,
        },
      ],
    });
    const args = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
    expect(args("eq")).toEqual([["event_id", "e1"], ["hidden", false]]);
    expect(args("order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
      ["position", { referencedTable: "post_media" }],
    ]);
    expect(args("limit")).toEqual([[PAGE_SIZE + 1]]);
    expect(args("or")).toEqual([]);
  });

  it("resumes after the cursor with a keyset filter on (created_at, id)", async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }]);
    mocks.db = db;

    await getWallPage(encodeCursor(STAMP, ID));

    expect(calls.find((c) => c.method === "or")!.args).toEqual([
      `created_at.lt."${STAMP}",and(created_at.eq."${STAMP}",id.lt.${ID})`,
    ]);
  });

  it("gives a next cursor, pointing at the last returned post, when there are more", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => row(i + 1));
    mocks.db = fakeDb([{ data: rows, error: null }]).db;

    const page = await getWallPage(null);

    expect(page.posts).toHaveLength(PAGE_SIZE);
    expect(page.nextCursor).toBe(encodeCursor(STAMP, rows[PAGE_SIZE - 1]!.id));
  });

  it("shows a wish with no media, and a video through its poster", async () => {
    const wish = row(2, { type: "wish", caption: null, wish_text: "Congrats!", post_media: [] });
    const video = row(3, {
      type: "video",
      post_media: [
        { kind: "video", path: "v.mp4", thumb_path: null, poster_path: "v_poster.jpg", duration_s: "42.5" },
      ],
    });
    mocks.db = fakeDb([{ data: [wish, video], error: null }]).db;

    const [w, v] = (await getWallPage(null)).posts;

    expect(w).toMatchObject({ wishText: "Congrats!", media: [] });
    expect(v!.media[0]).toMatchObject({
      kind: "video",
      posterUrl: "https://media.example.com/v_poster.jpg",
      durationS: 42.5,
    });
  });

  it("names a guest whose row is missing instead of crashing", async () => {
    mocks.db = fakeDb([{ data: [row(1, { guests: null })], error: null }]).db;
    expect((await getWallPage(null)).posts[0]!.author).toBe("Guest");
  });

  it("rejects a malformed cursor with 400 before querying", async () => {
    const { db, calls } = fakeDb([]);
    mocks.db = db;

    await expect(getWallPage("garbage")).rejects.toMatchObject({ status: 400, code: "invalid_cursor" });
    await expect(getWallPage("garbage")).rejects.toBeInstanceOf(AppError);
    expect(calls).toHaveLength(0);
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([{ data: null, error: { code: "XX000", message: "boom" } }]).db;
    await expect(getWallPage(null)).rejects.toThrow(/boom/);
  });
});

describe("getPost", () => {
  it("returns one visible post of this event, with its media in album order", async () => {
    const { db, calls } = fakeDb([{ data: row(1), error: null }]);
    mocks.db = db;

    const post = await getPost(ID);

    expect(post).toMatchObject({ id: row(1).id, author: "Ali", guestId: "a1" });
    const args = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
    expect(args("eq")).toEqual([["event_id", "e1"], ["hidden", false], ["id", ID]]);
    expect(args("order")).toEqual([["position", { referencedTable: "post_media" }]]);
  });

  it("is null for a post that is hidden, deleted or from another event", async () => {
    mocks.db = fakeDb([{ data: null, error: null }]).db;
    expect(await getPost(ID)).toBeNull();
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([{ data: null, error: { code: "XX000", message: "boom" } }]).db;
    await expect(getPost(ID)).rejects.toThrow(/boom/);
  });
});

describe("getMyPosts", () => {
  it("lists the guest's own visible posts, newest first and capped", async () => {
    const { db, calls } = fakeDb([{ data: [row(2), row(1)], error: null }]);
    mocks.db = db;

    const posts = await getMyPosts("a1");

    expect(posts.map((p) => p.id)).toEqual([row(2).id, row(1).id]);
    const args = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
    expect(args("eq")).toEqual([["event_id", "e1"], ["hidden", false], ["guest_id", "a1"]]);
    expect(args("order")[0]).toEqual(["created_at", { ascending: false }]);
    expect(args("limit")).toEqual([[MY_POSTS_MAX]]);
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([{ data: null, error: { code: "XX000", message: "boom" } }]).db;
    await expect(getMyPosts("a1")).rejects.toThrow(/boom/);
  });
});

describe("getLatestWishes", () => {
  it("asks for the newest visible wishes of this event, however many photos came after them", async () => {
    const { db, calls } = fakeDb([{ data: [row(2, { type: "wish", wish_text: "Congratulations!", post_media: [] })], error: null }]);
    mocks.db = db;

    const wishes = await getLatestWishes();

    expect(wishes).toHaveLength(1);
    expect(wishes[0]).toMatchObject({ type: "wish", wishText: "Congratulations!", author: "Ali" });
    const filters = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(filters).toEqual([["event_id", "e1"], ["hidden", false], ["type", "wish"]]);
    expect(calls.find((c) => c.method === "limit")!.args).toEqual([TICKER_WISHES]);
  });

  it("fails loudly when the lookup fails", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "XX000", message: "nope" } }]);
    mocks.db = db;
    await expect(getLatestWishes()).rejects.toThrow(/XX000 nope/);
  });
});

describe("getWallCounts", () => {
  it("maps the wall_counts row for this event", async () => {
    const { db, calls } = fakeDb([
      { data: [{ all_count: 10, photos: 4, videos: 1, wishes: 5 }], error: null },
    ]);
    mocks.db = db;

    expect(await getWallCounts()).toEqual({ all: 10, photos: 4, videos: 1, wishes: 5 });
    expect(calls[0]).toEqual({ table: "rpc", method: "wall_counts", args: [{ e: "e1" }] });
  });

  it("is all zeros when the function returns nothing, and throws on a database error", async () => {
    mocks.db = fakeDb([{ data: [], error: null }]).db;
    expect(await getWallCounts()).toEqual({ all: 0, photos: 0, videos: 0, wishes: 0 });

    mocks.db = fakeDb([{ data: null, error: { message: "nope" } }]).db;
    await expect(getWallCounts()).rejects.toThrow(/nope/);
  });
});
