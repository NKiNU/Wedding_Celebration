import { describe, expect, it } from "vitest";
import { derivePostType, stripShapeProblem, type UploadFile } from "./uploads";
import { clampPan, coverScale, cropRect, DEFAULT_WINDOWS, formatEventDate, stripTemplateUrl, windowsOf, windowsProblem, type Rect } from "./strip";

const win = { w: 500, h: 375 };

describe("windowsProblem", () => {
  it("accepts the default windows", () => {
    expect(windowsProblem(DEFAULT_WINDOWS)).toBeNull();
  });

  it("needs exactly three windows", () => {
    expect(windowsProblem(DEFAULT_WINDOWS.slice(0, 2))).toMatch(/exactly 3/);
  });

  it("rejects fractions, tiny windows, windows outside the template and overlaps", () => {
    const set = (i: number, r: Partial<Rect>) => DEFAULT_WINDOWS.map((w, j) => (j === i ? { ...w, ...r } : w));
    expect(windowsProblem(set(0, { x: 1.5 }))).toMatch(/whole pixel/);
    expect(windowsProblem(set(1, { w: 100 }))).toMatch(/at least/);
    expect(windowsProblem(set(2, { y: 1700 }))).toMatch(/inside/);
    expect(windowsProblem(set(0, { x: -1 }))).toMatch(/inside/);
    expect(windowsProblem(set(1, { y: 400 }))).toMatch(/Windows 1 and 2 overlap/);
  });

  it("allows windows that only touch", () => {
    expect(windowsProblem(DEFAULT_WINDOWS.map((w, i) => ({ ...w, y: 250 + i * 375 })))).toBeNull();
  });
});

describe("cover fit", () => {
  it("scales a photo so it just covers the window", () => {
    expect(coverScale({ w: 2000, h: 1000 }, win)).toBeCloseTo(0.375); // height decides
    expect(coverScale({ w: 1000, h: 2000 }, win)).toBeCloseTo(0.5); // width decides
  });

  it("never lets the photo leave a gap", () => {
    // a landscape photo at zoom 1 overhangs only left and right
    const photo = { w: 2000, h: 1000 };
    expect(clampPan({ x: 999, y: 999 }, 1, photo, win)).toEqual({ x: 125, y: 0 });
    expect(clampPan({ x: -999, y: 0 }, 1, photo, win)).toEqual({ x: -125, y: 0 });
    // zooming in gives room on both axes
    const z2 = clampPan({ x: 999, y: 999 }, 2, photo, win);
    expect(z2.x).toBeCloseTo(500);
    expect(z2.y).toBeCloseTo(187.5);
  });

  it("crops the centre by default and follows the pan", () => {
    const photo = { w: 2000, h: 1000 };
    const c = cropRect(photo, win, { x: 0, y: 0 }, 1);
    expect(c.w / c.h).toBeCloseTo(500 / 375);
    expect(c.h).toBeCloseTo(1000);
    expect(c.x).toBeCloseTo((2000 - c.w) / 2);
    // pan right by the full overhang: the left edge of the photo shows
    expect(cropRect(photo, win, { x: 125, y: 0 }, 1).x).toBeCloseTo(0);
    expect(cropRect(photo, win, { x: -9999, y: 0 }, 1).x + c.w).toBeCloseTo(2000);
  });

  it("zooms into a smaller part of the photo, within limits", () => {
    const photo = { w: 1000, h: 750 };
    expect(cropRect(photo, win, { x: 0, y: 0 }, 2).w).toBeCloseTo(500);
    expect(cropRect(photo, win, { x: 0, y: 0 }, 0.2).w).toBeCloseTo(1000); // zoom never below 1
    expect(cropRect(photo, win, { x: 0, y: 0 }, 99).w).toBeCloseTo(250); // nor above 4
  });
});

describe("formatEventDate", () => {
  it("reads like 07 Nov 2026", () => {
    expect(formatEventDate("2026-11-07")).toBe("07 Nov 2026");
  });

  it("is null for no date or a bad one", () => {
    expect(formatEventDate(null)).toBeNull();
    expect(formatEventDate("07/11/2026")).toBeNull();
    expect(formatEventDate("2026-02-30")).toBeNull();
  });
});

describe("strip uploads", () => {
  const jpeg = (position: number, extra: Partial<UploadFile> = {}): UploadFile => ({
    role: "main",
    position,
    mime: "image/jpeg",
    bytes: 1000,
    ...extra,
  });
  const strip = [jpeg(0, { width: 1080, height: 1920 }), jpeg(1), jpeg(2), jpeg(3)];

  it("is a strip only when the phone asks for one and the files have the strip shape", () => {
    expect(derivePostType(strip, "strip")).toBe("strip");
    expect(derivePostType(strip)).toBe("album"); // the same files without the layout are an album
    expect(derivePostType(strip.slice(0, 3), "strip")).toBeNull();
    expect(derivePostType([...strip.slice(0, 3), jpeg(3, { mime: "video/mp4" })], "strip")).toBeNull();
  });

  it("needs the finished image at story size, 1x or 2x", () => {
    expect(stripShapeProblem(strip)).toBeNull();
    // the app now makes 2x strips; a phone with the old page still sends 1x
    expect(stripShapeProblem([jpeg(0, { width: 2160, height: 3840 }), ...strip.slice(1)])).toBeNull();
    expect(stripShapeProblem([jpeg(0, { width: 2160, height: 1920 }), ...strip.slice(1)])).toMatch(/2160 × 3840/);
    expect(stripShapeProblem(strip.slice(1))).toMatch(/3 photos/);
    expect(stripShapeProblem([jpeg(0, { width: 1080, height: 1080 }), ...strip.slice(1)])).toMatch(/1080 × 1920/);
  });
});

describe("windowsOf / stripTemplateUrl", () => {
  it("falls back to the defaults for missing or broken windows", () => {
    expect(windowsOf(null)).toBe(DEFAULT_WINDOWS);
    expect(windowsOf([{ x: 1 }])).toBe(DEFAULT_WINDOWS);
    const saved = DEFAULT_WINDOWS.map((w) => ({ ...w, x: 100 }));
    expect(windowsOf(saved)).toEqual(saved);
  });

  it("points at the admin's template or the built-in one", () => {
    expect(stripTemplateUrl(null)).toBe("/strip/default-template.png");
    expect(stripTemplateUrl("events/e/admin/strip-1.png")).toBe("/strip/template?v=events%2Fe%2Fadmin%2Fstrip-1.png");
  });
});
