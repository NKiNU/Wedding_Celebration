import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallPost } from "../../../../../tests/fixtures/posts";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requireGuest: vi.fn(), getMyPosts: vi.fn() }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/wall", () => ({ getMyPosts: mocks.getMyPosts }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { GET } from "./route";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireGuest.mockResolvedValue(GUEST);
});

describe("GET /api/me/posts", () => {
  it("lists the active guest's own posts, whatever the query string says", async () => {
    mocks.getMyPosts.mockResolvedValue([wallPost()]);
    const res = await GET(new Request("http://localhost/api/me/posts?guest=other"));
    expect(await res.json()).toEqual({ ok: true, data: [wallPost()] });
    expect(mocks.getMyPosts).toHaveBeenCalledWith("g1");
  });

  it("is a 401 without a session", async () => {
    mocks.requireGuest.mockRejectedValueOnce(new AppError("no_session", 401, "Please enter your name again."));
    expect((await GET(new Request("http://localhost/api/me/posts"))).status).toBe(401);
    expect(mocks.getMyPosts).not.toHaveBeenCalled();
  });
});
