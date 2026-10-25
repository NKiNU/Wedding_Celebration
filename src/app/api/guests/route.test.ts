import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJar } from "../../../../tests/fixtures/cookies";

const mocks = vi.hoisted(() => ({ createGuest: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => fakeJar() }));
vi.mock("@/server/identity", () => ({ createGuest: mocks.createGuest }));

import { AppError } from "@/server/http";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/guests", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  mocks.createGuest.mockReset();
});

describe("POST /api/guests", () => {
  it("creates the guest from the normalized name and answers 201", async () => {
    mocks.createGuest.mockResolvedValue({ guestId: "g1", name: "Ali" });
    const res = await post({ name: "  Ali " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { guestId: "g1", name: "Ali" } });
    expect(mocks.createGuest.mock.calls[0][0]).toBe("Ali");
  });

  it("rejects an invalid name with 400 before touching the service", async () => {
    const res = await post({ name: "A" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("Please enter at least 2 characters.");
    expect(mocks.createGuest).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await POST(new Request("http://localhost/api/guests", { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("passes a taken-name 409 and its suggestions through", async () => {
    mocks.createGuest.mockImplementation(async () => {
      throw new AppError("name_taken", 409, "Taken.", { suggestions: ["Ali 2"] });
    });
    const res = await post({ name: "Ali" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.details).toEqual({ suggestions: ["Ali 2"] });
  });
});
