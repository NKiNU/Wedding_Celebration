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
    expect(await r2().head("k")).toEqual({ bytes: 42, mime: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledOnce();
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
