import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  requireAdmin: vi.fn(),
  updateEvent: vi.fn(),
  presignQr: vi.fn(),
  confirmQr: vi.fn(),
  presignMonogram: vi.fn(),
  confirmMonogram: vi.fn(),
  removeMonogram: vi.fn(),
  getModerationPage: vi.fn(),
  setHidden: vi.fn(),
  mediaManifest: vi.fn(),
  deletePostAsAdmin: vi.fn(),
}));
vi.mock("@/server/admin", () => mocks);
vi.mock("@/server/posts", () => ({ deletePostAsAdmin: mocks.deletePostAsAdmin }));
vi.mock("@/server/event", () => ({ getEvent: async () => ({ id: "e1" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { DELETE as deleteSession, POST as postSession } from "./session/route";
import { PATCH as patchEvent } from "./event/route";
import { POST as postQr, PUT as putQr } from "./qr/route";
import { DELETE as deleteMonogram, POST as postMonogram, PUT as putMonogram } from "./monogram/route";
import { GET as getPosts } from "./posts/route";
import { DELETE as deletePost, PATCH as patchPost } from "./posts/[id]/route";
import { GET as getMedia } from "./media/route";

const ID = "b0000000-0000-4000-8000-000000000001";
const json = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/admin/x", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("admin session", () => {
  it("logs in with the passcode and the caller's forwarded address", async () => {
    const res = await postSession(json("POST", { passcode: "pw" }, { "x-real-ip": "9.9.9.9" }));
    expect(res.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith("pw", "9.9.9.9", {});
  });

  it("passes the refusals on and rejects a missing passcode", async () => {
    mocks.login.mockRejectedValueOnce(new AppError("wrong_passcode", 401, "No."));
    expect((await postSession(json("POST", { passcode: "pw" }))).status).toBe(401);
    expect((await postSession(json("POST", {}))).status).toBe(400);
  });

  it("logs out", async () => {
    expect((await deleteSession(json("DELETE"))).status).toBe(200);
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("refuses a cross-site login", async () => {
    expect((await postSession(json("POST", { passcode: "pw" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(mocks.login).not.toHaveBeenCalled();
  });
});

describe("routes behind the admin cookie", () => {
  const calls: [string, () => Promise<Response>][] = [
    ["PATCH event", () => patchEvent(json("PATCH", { uploadsOpen: false }))],
    ["POST qr", () => postQr(json("POST", { mime: "image/png", bytes: 1000 }))],
    ["PUT qr", () => putQr(json("PUT", { key: "k" }))],
    ["POST monogram", () => postMonogram(json("POST", { mime: "image/png", bytes: 1000 }))],
    ["PUT monogram", () => putMonogram(json("PUT", { key: "k" }))],
    ["DELETE monogram", () => deleteMonogram(json("DELETE"))],
    ["GET posts", () => getPosts(json("GET"))],
    ["PATCH post", () => patchPost(json("PATCH", { hidden: true }), ctx)],
    ["DELETE post", () => deletePost(json("DELETE"), ctx)],
    ["GET media", () => getMedia(json("GET"))],
  ];

  it.each(calls)("%s is a 401 without the cookie and does nothing", async (_name, call) => {
    mocks.requireAdmin.mockImplementation(() => {
      throw new AppError("not_admin", 401, "Please enter the admin passcode.");
    });
    expect((await call()).status).toBe(401);
    for (const [name, m] of Object.entries(mocks)) {
      if (name !== "requireAdmin") expect(m).not.toHaveBeenCalled();
    }
  });

  it("updates the event", async () => {
    mocks.updateEvent.mockResolvedValue({ uploadsOpen: false });
    const res = await patchEvent(json("PATCH", { uploadsOpen: false, groomName: " Ali " }));
    expect(mocks.updateEvent).toHaveBeenCalledWith({ uploadsOpen: false, groomName: "Ali" });
    expect(await res.json()).toEqual({ ok: true, data: { uploadsOpen: false } });
  });

  it("rejects an empty or invalid event update", async () => {
    expect((await patchEvent(json("PATCH", {}))).status).toBe(400);
    expect((await patchEvent(json("PATCH", { groomName: "" }))).status).toBe(400);
    expect((await patchEvent(json("PATCH", { fontNames: "comic-sans" }))).status).toBe(400);
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it("presigns a QR (201) and rejects the wrong type or size", async () => {
    mocks.presignQr.mockResolvedValue({ key: "k", url: "u" });
    const res = await postQr(json("POST", { mime: "image/png", bytes: 1000 }));
    expect(res.status).toBe(201);
    expect(mocks.presignQr).toHaveBeenCalledWith("image/png", 1000);
    expect((await postQr(json("POST", { mime: "image/gif", bytes: 1000 }))).status).toBe(400);
    expect((await postQr(json("POST", { mime: "image/png", bytes: 3 * 1024 * 1024 }))).status).toBe(400);
  });

  it("confirms a QR", async () => {
    mocks.confirmQr.mockResolvedValue({ hasQr: true });
    expect((await putQr(json("PUT", { key: "k" }))).status).toBe(200);
    expect(mocks.confirmQr).toHaveBeenCalledWith("k");
    expect((await putQr(json("PUT", {}))).status).toBe(400);
  });

  it("presigns a monogram (201) and rejects the wrong type or size", async () => {
    mocks.presignMonogram.mockResolvedValue({ key: "k", url: "u" });
    const res = await postMonogram(json("POST", { mime: "image/svg+xml", bytes: 1000 }));
    expect(res.status).toBe(201);
    expect(mocks.presignMonogram).toHaveBeenCalledWith("image/svg+xml", 1000);
    expect((await postMonogram(json("POST", { mime: "image/gif", bytes: 1000 }))).status).toBe(400);
    expect((await postMonogram(json("POST", { mime: "image/png", bytes: 2 * 1024 * 1024 }))).status).toBe(400);
  });

  it("confirms and removes a monogram", async () => {
    mocks.confirmMonogram.mockResolvedValue({ monogramUrl: "u" });
    expect((await putMonogram(json("PUT", { key: "k" }))).status).toBe(200);
    expect(mocks.confirmMonogram).toHaveBeenCalledWith("k");
    expect((await putMonogram(json("PUT", {}))).status).toBe(400);
    mocks.removeMonogram.mockResolvedValue({ monogramUrl: null });
    expect((await deleteMonogram(json("DELETE"))).status).toBe(200);
    expect(mocks.removeMonogram).toHaveBeenCalled();
  });

  it("lists posts from a cursor", async () => {
    mocks.getModerationPage.mockResolvedValue({ posts: [], nextCursor: null });
    const req = new Request("http://localhost/api/admin/posts?cursor=abc");
    expect((await getPosts(req)).status).toBe(200);
    expect(mocks.getModerationPage).toHaveBeenCalledWith("abc");
  });

  it("hides, unhides and deletes by id, and rejects a malformed id or body", async () => {
    expect((await patchPost(json("PATCH", { hidden: true }), ctx)).status).toBe(200);
    expect(mocks.setHidden).toHaveBeenCalledWith(ID, true);
    expect((await deletePost(json("DELETE"), ctx)).status).toBe(200);
    expect(mocks.deletePostAsAdmin).toHaveBeenCalledWith("e1", ID);
    expect((await patchPost(json("PATCH", { hidden: "yes" }), ctx)).status).toBe(400);
    const bad = { params: Promise.resolve({ id: "../x" }) };
    expect((await deletePost(json("DELETE"), bad)).status).toBe(400);
  });

  it("returns the media manifest", async () => {
    mocks.mediaManifest.mockResolvedValue([{ url: "u", name: "n" }]);
    expect(await (await getMedia(json("GET"))).json()).toEqual({ ok: true, data: [{ url: "u", name: "n" }] });
  });
});
