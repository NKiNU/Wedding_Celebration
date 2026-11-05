import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requireGuest: vi.fn(), getOwnStripObject: vi.fn() }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/posts", () => ({ getOwnStripObject: mocks.getOwnStripObject }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { GET } from "./route";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const ID = "b0000000-0000-4000-8000-000000000001";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const get = (id = ID) =>
  GET(new Request(`http://localhost/api/posts/${id}/strip`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireGuest.mockResolvedValue(GUEST);
  mocks.getOwnStripObject.mockResolvedValue(JPEG);
});

describe("GET /api/posts/[id]/strip", () => {
  it("sends the owner their finished strip as a private JPEG download", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="photo-strip.jpg"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    expect(mocks.getOwnStripObject).toHaveBeenCalledWith(GUEST, ID);
  });

  it("is a 403 for someone else's strip and a 404 for a post that is not a strip", async () => {
    mocks.getOwnStripObject.mockRejectedValueOnce(new AppError("not_yours", 403, "nope"));
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_yours" } });
    mocks.getOwnStripObject.mockRejectedValueOnce(new AppError("post_not_found", 404, "gone"));
    expect((await get()).status).toBe(404);
  });

  it("is a 401 without a session and a 400 for a malformed id", async () => {
    mocks.requireGuest.mockRejectedValueOnce(new AppError("no_session", 401, "Please enter your name again."));
    expect((await get()).status).toBe(401);
    expect((await get("../x")).status).toBe(400);
    expect(mocks.getOwnStripObject).not.toHaveBeenCalled();
  });
});
