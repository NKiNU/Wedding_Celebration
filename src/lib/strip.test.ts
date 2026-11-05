import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cropRect, DEFAULT_WINDOWS } from "./domain/strip";
import { MediaError } from "./media";
import { composeStrip, DEFAULT_TEMPLATE_TEXT } from "./strip";

type Ctx = {
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  font: string;
  letterSpacing: string;
};
let contexts: Ctx[];
let blobs: { width: number; height: number; type?: string; quality: unknown }[];
let template: { width: number; height: number; close: ReturnType<typeof vi.fn> };
const fontsLoad = vi.fn(async () => []);

const photo = (w: number, h: number, pan = { x: 0, y: 0 }, zoom = 1) => ({
  source: { width: w, height: h } as unknown as HTMLCanvasElement,
  pan,
  zoom,
});
const PHOTOS = [photo(4000, 3000), photo(3000, 4000, { x: 50, y: -80 }, 2), photo(2048, 2048, { x: 0, y: 0 }, 1.5)];
const TEXT = { names: "Aiman & Sofea", date: "07 Nov 2026", namesFont: "'Pinyon Script', cursive" };

beforeEach(() => {
  contexts = [];
  blobs = [];
  template = { width: 1080, height: 1920, close: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => {
    const ctx = { drawImage: vi.fn(), fillText: vi.fn(), font: "", letterSpacing: "" };
    contexts.push(ctx);
    return ctx;
  }) as unknown as HTMLCanvasElement["getContext"]);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb, type, q) {
    blobs.push({ width: this.width, height: this.height, type, quality: q });
    cb(new Blob(["j"], { type: "image/jpeg" }));
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("png", { status: 200 })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => template));
  Object.defineProperty(document, "fonts", { value: { load: fontsLoad }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fontsLoad.mockClear();
});

describe("composeStrip", () => {
  it("draws the template, then each photo cropped by cropRect into its window", async () => {
    const out = await composeStrip({ templateUrl: "/strip/default-template.png", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: null });

    expect(fetch).toHaveBeenCalledWith("/strip/default-template.png");
    const [main] = contexts;
    expect(main!.drawImage.mock.calls[0]).toEqual([template, 0, 0, 1080, 1920]);
    DEFAULT_WINDOWS.forEach((win, i) => {
      const p = PHOTOS[i]!;
      const src = cropRect({ w: p.source.width, h: p.source.height }, win, p.pan, p.zoom);
      expect(main!.drawImage.mock.calls[i + 1]).toEqual([p.source, src.x, src.y, src.w, src.h, win.x, win.y, win.w, win.h]);
    });
    expect(main!.fillText).not.toHaveBeenCalled();
    expect(template.close).toHaveBeenCalled();
    expect(blobs).toEqual([
      { width: 1080, height: 1920, type: "image/jpeg", quality: 0.9 },
      { width: 338, height: 600, type: "image/jpeg", quality: 0.9 },
    ]);
    expect(out.image.type).toBe("image/jpeg");
    expect(out.thumb.type).toBe("image/jpeg");
  });

  it("draws the names and date on the default template, after the fonts load", async () => {
    await composeStrip({ templateUrl: "/t", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: TEXT });

    const { names, date } = DEFAULT_TEMPLATE_TEXT;
    expect(fontsLoad).toHaveBeenCalledWith("78px 'Pinyon Script', cursive");
    const fill = contexts[0]!.fillText;
    expect(fill).toHaveBeenNthCalledWith(1, "Aiman & Sofea", names.x, names.top + (names.size * names.lineHeight) / 2);
    expect(fill).toHaveBeenNthCalledWith(2, "07 Nov 2026", date.x, date.top + (date.size * date.lineHeight) / 2);
    expect(contexts[0]!.letterSpacing).toBe("6px");
  });

  it("leaves the date out when the event has none", async () => {
    await composeStrip({ templateUrl: "/t", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: { ...TEXT, date: null } });
    expect(contexts[0]!.fillText).toHaveBeenCalledTimes(1);
  });

  it("fails with a friendly message when the template cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(composeStrip({ templateUrl: "/t", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: null })).rejects.toThrow(
      MediaError,
    );
  });

  it("fails when the browser gives no canvas", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(composeStrip({ templateUrl: "/t", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: null })).rejects.toThrow(
      /couldn’t be made/,
    );
  });

  it("fails when the JPEG cannot be encoded", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((cb) => cb(null));
    await expect(composeStrip({ templateUrl: "/t", windows: DEFAULT_WINDOWS, photos: PHOTOS, text: null })).rejects.toThrow(
      MediaError,
    );
  });
});
