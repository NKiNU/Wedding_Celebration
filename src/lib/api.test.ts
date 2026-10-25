import { afterEach, describe, expect, it, vi } from "vitest";
import { api, REQUEST_TIMEOUT_MS } from "./api";

afterEach(() => vi.unstubAllGlobals());

const respond = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("api", () => {
  it("sends a JSON body and returns the parsed envelope", async () => {
    const fetchMock = respond({ ok: true, data: { n: 1 } });
    vi.stubGlobal("fetch", fetchMock);

    expect(await api("/api/x", "POST", { a: 1 })).toEqual({ ok: true, data: { n: 1 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      signal: expect.any(AbortSignal),
    });
  });

  it("gives up on a request that never answers, so the screen can recover", async () => {
    // Node's own AbortSignal.timeout ignores fake timers, so hand the request a signal we abort.
    const clock = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(clock.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
          }),
      ),
    );
    const pending = api("/api/x", "GET");
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    clock.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "network" } });
    timeout.mockRestore();
  });

  it("sends no body or content type when there is nothing to send", async () => {
    const fetchMock = respond({ ok: true, data: null });
    vi.stubGlobal("fetch", fetchMock);
    await api("/api/x", "DELETE");
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "DELETE",
      headers: undefined,
      body: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it("turns a failed request into an ok:false result that says what to do", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const result = await api("/api/x", "GET");
    expect(result).toMatchObject({ ok: false, error: { code: "network" } });
  });

  it("does the same when the server answers with something that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    expect(await api("/api/x", "GET")).toMatchObject({ ok: false, error: { code: "network" } });
  });
});
