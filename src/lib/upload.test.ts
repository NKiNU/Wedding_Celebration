import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { putFile } from "./upload";

class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  sent: unknown;
  status = 0;
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.sent = body;
  }
  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
}

beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeXhr));
afterEach(() => vi.unstubAllGlobals());

const blob = new Blob(["abc"]);

describe("putFile", () => {
  it("PUTs the blob with its content type only, reports progress and resolves on 2xx", async () => {
    const onProgress = vi.fn();
    const p = putFile("https://r2/x", blob, "image/jpeg", onProgress);
    const xhr = FakeXhr.last;

    xhr.upload.onprogress?.({ loaded: 2 });
    xhr.finish(200);

    await expect(p).resolves.toBeUndefined();
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://r2/x");
    expect(xhr.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(xhr.sent).toBe(blob);
    expect(onProgress).toHaveBeenCalledWith(2);
  });

  it("rejects on a non-2xx status", async () => {
    const p = putFile("u", blob, "image/jpeg", vi.fn());
    FakeXhr.last.finish(403);
    await expect(p).rejects.toThrow(/403/);
  });

  it("rejects on a network error", async () => {
    const p = putFile("u", blob, "image/jpeg", vi.fn());
    FakeXhr.last.onerror?.();
    await expect(p).rejects.toThrow();
  });

  it("rejects on timeout", async () => {
    const p = putFile("u", blob, "image/jpeg", vi.fn());
    FakeXhr.last.ontimeout?.();
    await expect(p).rejects.toThrow();
  });

  it("aborts the request and rejects when the signal fires", async () => {
    const ctrl = new AbortController();
    const p = putFile("u", blob, "image/jpeg", vi.fn(), ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(FakeXhr.last.abort).toHaveBeenCalled();
  });

  it("rejects immediately, without sending, when the signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    FakeXhr.last = undefined as unknown as FakeXhr;
    await expect(putFile("u", blob, "image/jpeg", vi.fn(), ctrl.signal)).rejects.toThrow();
    expect(FakeXhr.last).toBeUndefined();
  });
});
