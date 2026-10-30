// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { r2 } from "./r2";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllGlobals());

describe("presignPut", () => {
  it("signs the key, the expiry, and the exact content type and length", async () => {
    const url = new URL(await r2().presignPut("events/e1/p1/0.jpg", "image/jpeg", 1234));

    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/wedding/events/e1/p1/0.jpg");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the dev endpoint and region when set, path-style", async () => {
    vi.resetModules(); // env() caches its first parse
    vi.stubEnv("R2_ENDPOINT", "http://127.0.0.1:54321/storage/v1/s3/");
    vi.stubEnv("R2_REGION", "local");
    const fresh = await import("./r2");
    const url = new URL(await fresh.r2().presignPut("k.jpg", "image/jpeg", 1));
    vi.stubEnv("R2_ENDPOINT", "");
    vi.stubEnv("R2_REGION", "");

    expect(url.origin + url.pathname).toBe("http://127.0.0.1:54321/storage/v1/s3/wedding/k.jpg");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/\/local\/s3\/aws4_request$/);
  });

  it("gives a different signature when the declared size changes", async () => {
    const sig = async (bytes: number) =>
      new URL(await r2().presignPut("k", "image/jpeg", bytes)).searchParams.get("X-Amz-Signature");
    expect(await sig(10)).not.toBe(await sig(11));
  });
});

describe("head", () => {
  const stub = (res: Response) => {
    const fetchMock = vi.fn(async () => res);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("reads size and type of an existing object", async () => {
    const fetchMock = stub(new Response(null, { status: 200, headers: { "content-length": "42", "content-type": "image/jpeg" } }));
    expect(await r2().head("k")).toEqual({ bytes: 42, mime: "image/jpeg", overridden: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("flags an object stored with Content-Disposition or Content-Encoding", async () => {
    stub(new Response(null, { status: 200, headers: { "content-length": "1", "content-type": "image/jpeg", "content-disposition": "attachment" } }));
    expect(await r2().head("k")).toMatchObject({ overridden: true });
    stub(new Response(null, { status: 200, headers: { "content-length": "1", "content-type": "image/jpeg", "content-encoding": "gzip" } }));
    expect(await r2().head("k")).toMatchObject({ overridden: true });
  });

  it("is null for a missing object and throws on any other failure", async () => {
    stub(new Response(null, { status: 404 }));
    expect(await r2().head("k")).toBeNull();
    stub(new Response(null, { status: 500 }));
    await expect(r2().head("k")).rejects.toThrow(/500/);
  });
});

describe("deleteMany", () => {
  it("deletes every key and treats a missing one as done", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await r2().deleteMany(["a", "b"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when R2 refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(r2().deleteMany(["a"])).rejects.toThrow(/403/);
  });
});

describe("purge", () => {
  it("is a placeholder until the CDN is wired in: it resolves and makes no request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(r2().purge(["a"])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("peek", () => {
  const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i));

  it("reads the first bytes of an object with a ranged request", async () => {
    const fetchMock = vi.fn((request: Request) => Promise.resolve(new Response(bytes(16), { status: request ? 206 : 500 })));
    vi.stubGlobal("fetch", fetchMock);
    expect([...(await r2().peek("k"))!]).toEqual([...bytes(16)]);
    const sent = fetchMock.mock.calls[0]![0];
    expect(sent.headers.get("range")).toBe("bytes=0-15");
  });

  it("is fine with a file shorter than 16 bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes(4), { status: 206 })));
    expect((await r2().peek("k"))!.length).toBe(4);
  });

  it("is null when missing, and throws on other failures or when Range is ignored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await r2().peek("k")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(r2().peek("k")).rejects.toThrow(/403/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes(5000), { status: 200 })));
    await expect(r2().peek("k")).rejects.toThrow(/ignored the Range/);
  });
});

describe("read", () => {
  const chunked = (...parts: number[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const n of parts) controller.enqueue(new Uint8Array(n).fill(1));
          controller.close();
        },
      }),
      { status: 200 },
    );

  it("returns the whole body, or null when missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    expect([...(await r2().read("k", 10))!]).toEqual([1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await r2().read("k", 10)).toBeNull();
  });

  it("throws on other failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    await expect(r2().read("k", 10)).rejects.toThrow(/403/);
  });

  it("refuses a body whose content-length is over the cap", async () => {
    const res = new Response(new Uint8Array(20), { status: 200, headers: { "content-length": "20" } });
    vi.stubGlobal("fetch", vi.fn(async () => res));
    await expect(r2().read("k", 10)).rejects.toThrow(/larger than 10/);
  });

  it("stops reading a stream without content-length once it passes the cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunked(6, 6)));
    await expect(r2().read("k", 10)).rejects.toThrow(/larger than 10/);
    vi.stubGlobal("fetch", vi.fn(async () => chunked(4, 4)));
    expect((await r2().read("k", 10))!.length).toBe(8);
  });
});
