import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { putFile } from "@/lib/upload";
import { type MediaItem, useCreatePost } from "./useCreatePost";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/upload", () => ({ putFile: vi.fn() }));

const apiMock = vi.mocked(api);
const putMock = vi.mocked(putFile);

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const items: MediaItem[] = [
  { role: "main", position: 0, blob: new Blob(["aaaa"]), mime: "image/jpeg", width: 40, height: 30 },
  { role: "thumb", position: 0, blob: new Blob(["bb"]), mime: "image/jpeg", width: 20, height: 15 },
];
const intent = {
  postId: "p1",
  uploads: [
    { role: "thumb" as const, position: 0, url: "https://r2/thumb" },
    { role: "main" as const, position: 0, url: "https://r2/main" },
  ],
};
const paths = () => apiMock.mock.calls.map(([path, method]) => `${method} ${path}`);

beforeEach(() => {
  vi.resetAllMocks();
  putMock.mockImplementation(async (_url, body, _mime, onProgress) => onProgress(body.size));
});

describe("postMedia", () => {
  it("asks for an intent, uploads every file by role and position, then creates the post", async () => {
    apiMock.mockResolvedValueOnce(ok(intent)).mockResolvedValueOnce(ok({ id: "p1" }));
    const { result } = renderHook(() => useCreatePost());

    let posted = false;
    await act(async () => {
      posted = await result.current.postMedia(items, "  nice day  ");
    });

    expect(posted).toBe(true);
    expect(apiMock.mock.calls[0]).toEqual([
      "/api/uploads",
      "POST",
      {
        files: [
          { role: "main", position: 0, mime: "image/jpeg", bytes: 4, width: 40, height: 30 },
          { role: "thumb", position: 0, mime: "image/jpeg", bytes: 2, width: 20, height: 15 },
        ],
      },
    ]);
    expect(putMock.mock.calls.map(([url, body]) => [url, (body as Blob).size])).toEqual([
      ["https://r2/thumb", 2],
      ["https://r2/main", 4],
    ]);
    expect(apiMock.mock.calls[1]).toEqual(["/api/posts", "POST", { postId: "p1", caption: "nice day" }]);
    expect(paths()).toEqual(["POST /api/uploads", "POST /api/posts"]);
    expect(result.current).toMatchObject({ status: "idle", progress: 0, error: null });
  });

  it("omits a blank caption", async () => {
    apiMock.mockResolvedValueOnce(ok(intent)).mockResolvedValueOnce(ok({ id: "p1" }));
    const { result } = renderHook(() => useCreatePost());
    await act(async () => {
      await result.current.postMedia(items, "   ");
    });
    expect(apiMock.mock.calls[1]![2]).toEqual({ postId: "p1" });
  });

  it("reports progress as bytes loaded over all bytes of all files", async () => {
    apiMock.mockResolvedValueOnce(ok(intent)).mockResolvedValueOnce(ok({ id: "p1" }));
    const reporters: Record<string, (n: number) => void> = {};
    const finish: Array<() => void> = [];
    putMock.mockImplementation(
      (url, _b, _m, onProgress) =>
        new Promise<void>((resolve) => {
          reporters[url] = onProgress;
          finish.push(resolve);
        }),
    );
    const { result } = renderHook(() => useCreatePost());

    let done!: Promise<boolean>;
    act(() => {
      done = result.current.postMedia(items, "");
    });
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    expect(result.current.status).toBe("uploading");

    act(() => reporters["https://r2/main"]!(3));
    expect(result.current.progress).toBeCloseTo(3 / 6);
    act(() => reporters["https://r2/thumb"]!(2));
    expect(result.current.progress).toBeCloseTo(5 / 6);

    await act(async () => {
      finish.forEach((f) => f());
      await done;
    });
    expect(result.current.status).toBe("idle");
  });

  it("aborts the other uploads and deletes the intent when a PUT fails", async () => {
    apiMock.mockResolvedValueOnce(ok(intent)).mockResolvedValue(ok({}));
    let signal: AbortSignal | undefined;
    putMock.mockImplementation(async (url, _b, _m, _p, s) => {
      if (url.endsWith("thumb")) throw new Error("boom");
      signal = s;
    });
    const { result } = renderHook(() => useCreatePost());

    let posted = true;
    await act(async () => {
      posted = await result.current.postMedia(items, "");
    });

    expect(posted).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(paths()).toEqual(["POST /api/uploads", "DELETE /api/uploads/p1"]);
    expect(result.current.error).toBe("Upload didn’t finish. Check your connection and try again.");
    expect(result.current.status).toBe("idle");
  });

  it("deletes the intent and shows the server message when creating the post fails", async () => {
    apiMock
      .mockResolvedValueOnce(ok(intent))
      .mockResolvedValueOnce(fail("closed", "Uploads are closed."))
      .mockResolvedValue(ok({}));
    const { result } = renderHook(() => useCreatePost());

    let posted = true;
    await act(async () => {
      posted = await result.current.postMedia(items, "hi");
    });

    expect(posted).toBe(false);
    expect(paths()).toEqual(["POST /api/uploads", "POST /api/posts", "DELETE /api/uploads/p1"]);
    expect(result.current.error).toBe("Uploads are closed.");
  });

  it("shows the message and does not delete anything when the intent is refused", async () => {
    apiMock.mockResolvedValueOnce(fail("rate_limited", "Too many uploads. Try again later."));
    const { result } = renderHook(() => useCreatePost());

    let posted = true;
    await act(async () => {
      posted = await result.current.postMedia(items, "");
    });

    expect(posted).toBe(false);
    expect(paths()).toEqual(["POST /api/uploads"]);
    expect(putMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Too many uploads. Try again later.");
  });

  it("fails cleanly when the server returns a URL for a file we did not ask for", async () => {
    apiMock
      .mockResolvedValueOnce(ok({ postId: "p1", uploads: [{ role: "poster", position: 0, url: "u" }] }))
      .mockResolvedValue(ok({}));
    const { result } = renderHook(() => useCreatePost());
    let posted = true;
    await act(async () => {
      posted = await result.current.postMedia(items, "");
    });
    expect(posted).toBe(false);
    expect(paths()).toEqual(["POST /api/uploads", "DELETE /api/uploads/p1"]);
  });
});

describe("postWish", () => {
  it("posts the wish text", async () => {
    apiMock.mockResolvedValueOnce(ok({ id: "w1" }));
    const { result } = renderHook(() => useCreatePost());
    let posted = false;
    await act(async () => {
      posted = await result.current.postWish("Congrats!");
    });
    expect(posted).toBe(true);
    expect(apiMock).toHaveBeenCalledWith("/api/posts", "POST", { wishText: "Congrats!" });
    expect(result.current.error).toBeNull();
  });

  it("surfaces the server message on failure, and reset clears it", async () => {
    apiMock.mockResolvedValueOnce(fail("invalid", "Wish is too short."));
    const { result } = renderHook(() => useCreatePost());
    let posted = true;
    await act(async () => {
      posted = await result.current.postWish("hi");
    });
    expect(posted).toBe(false);
    expect(result.current.error).toBe("Wish is too short.");

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ error: null, progress: 0, status: "idle" });
  });
});
