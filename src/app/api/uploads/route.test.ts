import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ requireGuest: vi.fn(), createUploadIntent: vi.fn() }));
vi.mock("@/server/identity", () => ({ requireGuest: mocks.requireGuest }));
vi.mock("@/server/uploads", () => ({ createUploadIntent: mocks.createUploadIntent }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { POST } from "./route";

const GUEST = { id: "g1", name: "Ali", eventId: "e1" };
const photo = [
  { role: "main", position: 0, mime: "image/jpeg", bytes: 1000 },
  { role: "thumb", position: 0, mime: "image/jpeg", bytes: 100 },
];
const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/uploads", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.requireGuest.mockResolvedValue(GUEST);
  mocks.createUploadIntent.mockResolvedValue({ postId: "p1", uploads: [] });
});

describe("POST /api/uploads", () => {
  it("issues an intent for the active guest and answers 201", async () => {
    const res = await send({ files: photo });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { postId: "p1", uploads: [] } });
    expect(mocks.createUploadIntent).toHaveBeenCalledWith(GUEST, photo, null);
  });

  it("passes a strip layout on, and refuses one whose files are not a strip", async () => {
    const strip = [0, 1, 2, 3].flatMap((position) => [
      { role: "main", position, mime: "image/jpeg", bytes: 1000, ...(position === 0 ? { width: 1080, height: 1920 } : {}) },
      { role: "thumb", position, mime: "image/jpeg", bytes: 100 },
    ]);
    expect((await send({ files: strip, layout: "strip" })).status).toBe(201);
    expect(mocks.createUploadIntent).toHaveBeenLastCalledWith(GUEST, strip, "strip");
    expect((await send({ files: photo, layout: "strip" })).status).toBe(400);
    expect((await send({ files: strip, layout: "collage" })).status).toBe(400);
  });

  it("is a 401 without a session", async () => {
    mocks.requireGuest.mockRejectedValue(new AppError("no_session", 401, "Please enter your name again."));
    expect((await send({ files: photo })).status).toBe(401);
    expect(mocks.createUploadIntent).not.toHaveBeenCalled();
  });

  it("is a 400 with the reason for files that cannot make a post", async () => {
    const res = await send({ files: [photo[0]] });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/thumbnail/);
    expect(mocks.createUploadIntent).not.toHaveBeenCalled();
  });

  it("is a 400 for a body that is not JSON", async () => {
    const res = await POST(new Request("http://localhost/api/uploads", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });

  it("refuses a cross-site request", async () => {
    expect((await send({ files: photo }, { origin: "https://evil.example" })).status).toBe(403);
  });
});
