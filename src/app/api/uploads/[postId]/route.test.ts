import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requireGuest: vi.fn(), cancelUploadIntent: vi.fn() }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/uploads", () => ({ cancelUploadIntent: mocks.cancelUploadIntent }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { DELETE } from "./route";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const ID = "b0000000-0000-4000-8000-000000000001";
const del = (postId: string, headers: Record<string, string> = {}) =>
  DELETE(new Request(`http://localhost/api/uploads/${postId}`, { method: "DELETE", headers }), {
    params: Promise.resolve({ postId }),
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireGuest.mockResolvedValue(GUEST);
  mocks.cancelUploadIntent.mockResolvedValue(undefined);
});

describe("DELETE /api/uploads/[postId]", () => {
  it("cancels the guest's own intent", async () => {
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: null });
    expect(mocks.cancelUploadIntent).toHaveBeenCalledWith(GUEST, ID);
  });

  it("passes the service's refusal on (the post already exists)", async () => {
    mocks.cancelUploadIntent.mockRejectedValue(new AppError("already_posted", 409, "That post is already on the wall."));
    expect((await del(ID)).status).toBe(409);
  });

  it("is a 401 without a session and a 400 for a malformed id", async () => {
    mocks.requireGuest.mockRejectedValueOnce(new AppError("no_session", 401, "Please enter your name again."));
    expect((await del(ID)).status).toBe(401);
    expect((await del("../x")).status).toBe(400);
    expect(mocks.cancelUploadIntent).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request", async () => {
    expect((await del(ID, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
});
