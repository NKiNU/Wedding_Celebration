import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WINDOWS } from "@/lib/domain/strip";

const mocks = vi.hoisted(() => ({ postMedia: vi.fn(), preparePhoto: vi.fn(), composeStrip: vi.fn(), close: vi.fn() }));
vi.mock("@/components/drawers/useCreatePost", () => ({
  useCreatePost: () => ({ status: "idle", progress: 0, error: null, postMedia: mocks.postMedia }),
}));
vi.mock("@/lib/media", () => ({ preparePhoto: mocks.preparePhoto, MediaError: class MediaError extends Error {} }));
vi.mock("@/lib/strip", () => ({ composeStrip: mocks.composeStrip }));

import { MediaError } from "@/lib/media";
import { type StripInput, usePostStrip } from "./usePostStrip";

const blob = (s: string) => new Blob([s]);
const input = (): StripInput => ({
  templateUrl: "/strip/default-template.png",
  windows: DEFAULT_WINDOWS,
  photos: ["a", "b", "c"].map((name, i) => ({ file: new File(["x"], name), pan: { x: i, y: 0 }, zoom: 1 + i })),
  text: { names: "Ali & Siti", date: null, namesFont: "cursive" },
  caption: "Us",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.postMedia.mockResolvedValue(true);
  mocks.preparePhoto.mockImplementation(async (file: File) => ({ main: blob(`main-${file.name}`), thumb: blob("t"), width: 2048, height: 1536 }));
  mocks.composeStrip.mockResolvedValue({ image: blob("strip"), thumb: blob("strip-thumb") });
  vi.stubGlobal("createImageBitmap", vi.fn(async (b: Blob) => ({ width: 2048, height: 1536, close: mocks.close, from: b })));
});
afterEach(() => vi.unstubAllGlobals());

describe("usePostStrip", () => {
  it("composes the strip from the resized photos and uploads it as position 0, the photos as 1-3", async () => {
    const { result } = renderHook(() => usePostStrip());
    let ok = false;
    await act(async () => {
      ok = await result.current.post(input());
    });
    expect(ok).toBe(true);

    const composed = mocks.composeStrip.mock.calls[0]![0];
    expect(composed.templateUrl).toBe("/strip/default-template.png");
    expect(composed.text).toEqual({ names: "Ali & Siti", date: null, namesFont: "cursive" });
    expect(composed.photos.map((p: { pan: { x: number }; zoom: number }) => [p.pan.x, p.zoom])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(mocks.close).toHaveBeenCalledTimes(3);

    const [items, caption, layout] = mocks.postMedia.mock.calls[0]!;
    expect(caption).toBe("Us");
    expect(layout).toBe("strip");
    expect(items.map((it: { role: string; position: number; width?: number; height?: number }) => [it.role, it.position, it.width, it.height])).toEqual([
      ["main", 0, 2160, 3840],
      ["thumb", 0, undefined, undefined],
      ["main", 1, 2048, 1536],
      ["thumb", 1, undefined, undefined],
      ["main", 2, 2048, 1536],
      ["thumb", 2, undefined, undefined],
      ["main", 3, 2048, 1536],
      ["thumb", 3, undefined, undefined],
    ]);
    expect(items.every((it: { mime: string }) => it.mime === "image/jpeg")).toBe(true);
    expect(result.current.busy).toBe(false);
  });

  it("names the photo that cannot be read and uploads nothing", async () => {
    mocks.preparePhoto.mockResolvedValueOnce({ main: blob("m"), thumb: blob("t"), width: 1, height: 1 }).mockRejectedValueOnce(new MediaError("Too small."));
    const { result } = renderHook(() => usePostStrip());
    await act(async () => {
      expect(await result.current.post(input())).toBe(false);
    });
    expect(result.current.error).toBe("Photo 2: Too small.");
    expect(mocks.postMedia).not.toHaveBeenCalled();
  });

  it("gives a plain message for an unexpected failure, and still releases the photos", async () => {
    mocks.composeStrip.mockRejectedValue(new Error("canvas"));
    const { result } = renderHook(() => usePostStrip());
    await act(async () => {
      await result.current.post(input());
    });
    expect(result.current.error).toBe("The photo strip couldn’t be made. Please try again.");
    expect(mocks.close).toHaveBeenCalledTimes(3);
  });

  it("explains an unreadable photo without a reason", async () => {
    mocks.preparePhoto.mockRejectedValue(new Error("?"));
    const { result } = renderHook(() => usePostStrip());
    await act(async () => {
      await result.current.post(input());
    });
    expect(result.current.error).toBe("Photo 1: This photo can’t be read. Try another one.");
  });
});
