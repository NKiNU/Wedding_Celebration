import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requireGuest: vi.fn(), deletePost: vi.fn() }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/posts", () => ({ deletePost: mocks.deletePost }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { DELETE } from "./route";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const ID = "b0000000-0000-4000-8000-000000000001";
const del = (id: string, headers: Record<string, string> = {}) =>
  DELETE(new Request(`http://localhost/api/posts/${id}`, { method: "DELETE", headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireGuest.mockResolvedValue(GUEST);
  mocks.deletePost.mockResolvedValue(undefined);
});

describe("DELETE /api/posts/[id]", () => {
  it("deletes the active guest's post", async () => {
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: null });
    expect(mocks.deletePost).toHaveBeenCalledWith(GUEST, ID);
  });

  it("passes the service's refusals on (not yours, already gone)", async () => {
    mocks.deletePost.mockRejectedValueOnce(new AppError("not_yours", 403, "You can only delete your own posts."));
    expect((await del(ID)).status).toBe(403);
    mocks.deletePost.mockRejectedValueOnce(new AppError("post_not_found", 404, "That post is already gone."));
    expect((await del(ID)).status).toBe(404);
  });

  it("is a 401 without a session and a 400 for a malformed id", async () => {
    mocks.requireGuest.mockRejectedValueOnce(new AppError("no_session", 401, "Please enter your name again."));
    expect((await del(ID)).status).toBe(401);
    expect((await del("../x")).status).toBe(400);
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request before anything else", async () => {
    expect((await del(ID, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(mocks.requireGuest).not.toHaveBeenCalled();
  });
});
