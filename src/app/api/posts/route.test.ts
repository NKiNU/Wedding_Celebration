import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({
  getWallPage: vi.fn(),
  getWallCounts: vi.fn(),
  requireGuest: vi.fn(),
  createWish: vi.fn(),
  createMediaPost: vi.fn(),
}));
vi.mock("@/server/wall", () => ({ getWallPage: mocks.getWallPage, getWallCounts: mocks.getWallCounts }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/posts", () => ({ createWish: mocks.createWish, createMediaPost: mocks.createMediaPost }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { GET, POST } from "./route";

const page = { posts: [], nextCursor: "next" };
const counts = { all: 1, photos: 1, videos: 0, wishes: 0 };
const get = (query = "") => GET(new Request(`http://localhost/api/posts${query}`));

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getWallPage.mockResolvedValue(page);
  mocks.getWallCounts.mockResolvedValue(counts);
});

describe("GET /api/posts", () => {
  it("returns the first page with the counts", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { ...page, counts } });
    expect(mocks.getWallPage).toHaveBeenCalledWith(null);
  });

  it("returns a later page without counts", async () => {
    const res = await get("?cursor=abc");
    expect(await res.json()).toEqual({ ok: true, data: { ...page, counts: null } });
    expect(mocks.getWallPage).toHaveBeenCalledWith("abc");
    expect(mocks.getWallCounts).not.toHaveBeenCalled();
  });

  it("maps a bad cursor to 400", async () => {
    mocks.getWallPage.mockRejectedValue(new AppError("invalid_cursor", 400, "That page link is not valid."));
    const res = await get("?cursor=bad");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_cursor");
  });
});

describe("POST /api/posts", () => {
  const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
  const ID = "b0000000-0000-4000-8000-000000000001";
  const send = (body: unknown, headers: Record<string, string> = {}) =>
    POST(new Request("http://localhost/api/posts", { method: "POST", body: JSON.stringify(body), headers }));

  beforeEach(() => {
    mocks.requireGuest.mockResolvedValue(GUEST);
    mocks.createWish.mockResolvedValue({ id: ID });
    mocks.createMediaPost.mockResolvedValue({ id: ID });
  });

  it("creates a wish as the active guest and answers 201", async () => {
    const res = await send({ wishText: " Congratulations! " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { id: ID } });
    expect(mocks.createWish).toHaveBeenCalledWith(GUEST, "Congratulations!");
  });

  it("creates the media post for an intent, with its caption", async () => {
    await send({ postId: ID, caption: "Akad" });
    expect(mocks.createMediaPost).toHaveBeenCalledWith(GUEST, ID, "Akad");
  });

  it("ignores a client-sent type, guest or author", async () => {
    await send({ wishText: "Congratulations!", type: "video", guestId: "someone-else", author: "Nobody" });
    expect(mocks.createWish).toHaveBeenCalledWith(GUEST, "Congratulations!");
    expect(mocks.createMediaPost).not.toHaveBeenCalled();
  });

  it("is a 401 without a session and calls no service", async () => {
    mocks.requireGuest.mockRejectedValue(new AppError("no_session", 401, "Please enter your name again."));
    const res = await send({ wishText: "Congratulations!" });
    expect(res.status).toBe(401);
    expect(mocks.createWish).not.toHaveBeenCalled();
  });

  it.each([{}, { postId: "nope" }, { wishText: "ab" }, { postId: ID, wishText: "both here" }, null])(
    "is a 400 for a malformed body (%j)",
    async (body) => {
      expect((await send(body)).status).toBe(400);
    },
  );

  it("refuses a cross-site request", async () => {
    const res = await send({ wishText: "Congratulations!" }, { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(mocks.requireGuest).not.toHaveBeenCalled();
  });
});
