import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_VIDEO_BYTES } from "./domain/limits";
import { MediaError, preparePhoto, prepareVideo } from "./media";

type Call = { width: number; height: number; type: string | undefined; quality: unknown };
let blobCalls: Call[];
let nullBlob: boolean;
let revoke: ReturnType<typeof vi.fn>;
const realCreate = document.createElement.bind(document);

const photo = () => new File(["x"], "a.jpg", { type: "image/jpeg" });
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

beforeEach(() => {
  blobCalls = [];
  nullBlob = false;
  revoke = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement["getContext"]);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    cb,
    type,
    quality,
  ) {
    blobCalls.push({ width: this.width, height: this.height, type, quality });
    cb(nullBlob ? null : new Blob(["j"], { type: "image/jpeg" }));
  });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

class DecodableImage {
  naturalWidth = 1000;
  naturalHeight = 500;
  src = "";
  decode = vi.fn().mockResolvedValue(undefined);
}

describe("preparePhoto", () => {
  it("resizes to a 2048 main and a 600 thumb as JPEG at quality 0.82", async () => {
    const bmp = bitmap(4000, 3000);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bmp));

    const out = await preparePhoto(photo());

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(blobCalls).toEqual([
      { width: 2048, height: 1536, type: "image/jpeg", quality: 0.82 },
      { width: 600, height: 450, type: "image/jpeg", quality: 0.82 },
    ]);
    expect(out).toMatchObject({ width: 2048, height: 1536 });
    expect(out.main).toBeInstanceOf(Blob);
    expect(out.thumb).toBeInstanceOf(Blob);
    expect(bmp.close).toHaveBeenCalled();
  });

  it("never enlarges a small photo", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap(300, 200)));
    const out = await preparePhoto(photo());
    expect(out).toMatchObject({ width: 300, height: 200 });
  });

  it("falls back to an Image element when createImageBitmap throws", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("heic")));
    vi.stubGlobal("Image", DecodableImage);

    const out = await preparePhoto(photo());

    expect(out).toMatchObject({ width: 1000, height: 500 });
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("falls back when createImageBitmap does not exist", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", DecodableImage);
    await expect(preparePhoto(photo())).resolves.toMatchObject({ width: 1000, height: 500 });
  });

  it("throws a MediaError when both decoders fail, and still revokes the URL", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("no")));
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = vi.fn().mockRejectedValue(new Error("no"));
      },
    );

    const err = await preparePhoto(photo()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MediaError);
    expect((err as Error).message).toBe("This photo can’t be read. Try another one.");
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("throws a MediaError when the canvas yields no blob", async () => {
    const bmp = bitmap(100, 100);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bmp));
    nullBlob = true;

    await expect(preparePhoto(photo())).rejects.toBeInstanceOf(MediaError);
    expect(bmp.close).toHaveBeenCalled();
  });
});

function fakeVideo(duration: number, size = { w: 1280, h: 720 }) {
  const video = realCreate("video");
  Object.defineProperty(video, "duration", { value: duration, configurable: true });
  Object.defineProperty(video, "videoWidth", { value: size.w, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: size.h, configurable: true });
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "video" ? video : realCreate(tag)) as typeof document.createElement);
  return video;
}

const mp4 = (bytes = 10) => {
  const f = new File(["v"], "a.mp4", { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

describe("prepareVideo", () => {
  it("rejects an oversize file without creating a video element", async () => {
    const spy = vi.spyOn(document, "createElement");
    const err = await prepareVideo(mp4(MAX_VIDEO_BYTES + 1)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaError);
    expect((err as Error).message).toMatch(/under 80 MB/);
    expect(spy).not.toHaveBeenCalledWith("video");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reads metadata, seeks to 0.5 s and returns a poster", async () => {
    const video = fakeVideo(12);
    const file = mp4();
    const p = prepareVideo(file);
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(video.currentTime).toBe(0.5);
    video.dispatchEvent(new Event("seeked"));

    const out = await p;

    expect(out).toMatchObject({ file, width: 1280, height: 720, durationS: 12 });
    expect(out.poster).toBeInstanceOf(Blob);
    expect(blobCalls[0]).toMatchObject({ width: 600, height: 338, quality: 0.82 });
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("seeks to half the duration for a very short clip", async () => {
    const video = fakeVideo(0.4);
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(video.currentTime).toBe(0.2);
    video.dispatchEvent(new Event("seeked"));
    await p;
  });

  it("rejects a 61 s video", async () => {
    const video = fakeVideo(61);
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("loadedmetadata"));
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaError);
    expect((err as Error).message).toMatch(/61 s/);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("rejects an infinite duration", async () => {
    const video = fakeVideo(Infinity);
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("loadedmetadata"));
    await expect(p).rejects.toBeInstanceOf(MediaError);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("rejects when the browser cannot decode the file", async () => {
    const video = fakeVideo(5);
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("error"));
    await expect(p).rejects.toBeInstanceOf(MediaError);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("resolves with poster null when the poster cannot be made", async () => {
    const video = fakeVideo(5);
    nullBlob = true;
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("seeked"));
    await expect(p).resolves.toMatchObject({ poster: null, durationS: 5 });
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("times out with a MediaError when metadata never loads", async () => {
    vi.useFakeTimers();
    fakeVideo(5);
    const caught = prepareVideo(mp4()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await caught;
    expect(err).toBeInstanceOf(MediaError);
    expect((err as Error).message).toBe("This video can’t be read. Try another one.");
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("keeps the video without a poster when the seek never completes", async () => {
    vi.useFakeTimers();
    const video = fakeVideo(5);
    const p = prepareVideo(mp4());
    video.dispatchEvent(new Event("loadedmetadata"));
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toMatchObject({ poster: null, durationS: 5 });
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
