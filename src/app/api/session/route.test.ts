import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJar } from "../../../../tests/fixtures/cookies";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  activateGuest: vi.fn(),
  clearActive: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => fakeJar() }));
vi.mock("@/server/identity", () => mocks);

import { DELETE, GET, POST } from "./route";

const GUEST_ID = "a0000000-0000-4000-8000-000000000003";
const call = (method: string, body?: unknown) =>
  new Request("http://localhost/api/session", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (body: unknown) => POST(call("POST", body));

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("/api/session", () => {
  it("GET answers who this phone is", async () => {
    const session = { active: null, known: [{ guestId: GUEST_ID, name: "Ali" }] };
    mocks.getSession.mockResolvedValue(session);
    const res = await GET(call("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: session });
  });

  it("POST activates one of this phone's guests", async () => {
    mocks.activateGuest.mockResolvedValue({ guestId: GUEST_ID, name: "Ali" });
    const res = await post({ guestId: GUEST_ID });
    expect(res.status).toBe(200);
    expect(mocks.activateGuest.mock.calls[0][0]).toBe(GUEST_ID);
  });

  it("POST rejects a malformed guest id with 400", async () => {
    const res = await post({ guestId: "nope" });
    expect(res.status).toBe(400);
    expect(mocks.activateGuest).not.toHaveBeenCalled();
  });

  it("DELETE switches name by clearing the active identity", async () => {
    const res = await DELETE(call("DELETE"));
    expect(res.status).toBe(200);
    expect(mocks.clearActive).toHaveBeenCalledOnce();
  });
});
