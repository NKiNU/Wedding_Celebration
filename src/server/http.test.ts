import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, handle } from "./http";

afterEach(() => vi.restoreAllMocks());

const req = (init: { method?: string; headers?: Record<string, string> } = {}) =>
  new Request("https://wedding.example/api/x", { method: "POST", ...init });

describe("handle", () => {
  it("wraps the result in an ok envelope with the requested status", async () => {
    const res = await handle(req(), async () => ({ id: 1 }), 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { id: 1 } });
  });

  it("maps an AppError to its status, code, message and details", async () => {
    const res = await handle(req(), async () => {
      throw new AppError("name_taken", 409, "Taken.", { suggestions: ["Ali 2"] });
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "name_taken", message: "Taken.", details: { suggestions: ["Ali 2"] } },
    });
  });

  it("maps a validation failure to 400 with the first issue's message", async () => {
    const res = await handle(req(), async () => z.string().min(2, "Too short.").parse("a"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "invalid_input", message: "Too short." },
    });
  });

  it("hides unexpected errors from the client and logs them on the server", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(req(), async () => {
      throw new Error("connection string leaked");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("leaked");
    expect(body.error.code).toBe("internal");
    expect(log).toHaveBeenCalled();
  });
});

describe("handle: cross-site protection", () => {
  const run = vi.fn(async () => "done");
  const attempt = async (init: Parameters<typeof req>[0]) => {
    run.mockClear();
    const res = await handle(req(init), run);
    return { res, ran: run.mock.calls.length > 0 };
  };

  it.each([
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a sibling-subdomain request", { "sec-fetch-site": "same-site" }],
    ["a foreign Origin (older browsers send no Sec-Fetch-Site)", { origin: "https://evil.example" }],
    ["an opaque Origin", { origin: "null" }],
  ])("refuses %s before running anything", async (_name, headers) => {
    const { res, ran } = await attempt({ headers });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
    expect(ran).toBe(false);
  });

  it.each([
    ["a same-origin request", { "sec-fetch-site": "same-origin" }],
    ["a matching Origin", { origin: "https://wedding.example" }],
    ["a request with no browser headers", {}],
  ])("allows %s", async (_name, headers) => {
    const { res, ran } = await attempt({ headers });
    expect(res.status).toBe(200);
    expect(ran).toBe(true);
  });

  it("does not guard reads", async () => {
    const { res } = await attempt({ method: "GET", headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(200);
  });
});
