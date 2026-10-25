import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ getWallPage: vi.fn(), getWallCounts: vi.fn() }));
vi.mock("@/server/wall", () => mocks);

import { GET } from "./route";

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
