import { describe, expect, it } from "vitest";
import { MB } from "./limits";
import {
  derivePostType,
  extFromMime,
  fitWithin,
  looksLike,
  mediaKey,
  qrKey,
  qrProblem,
  totalBytes,
  uploadProblem,
  videoProblem,
  type UploadFile,
} from "./uploads";

const JPG = "image/jpeg";
const main = (position: number, over: Partial<UploadFile> = {}): UploadFile => ({
  role: "main",
  position,
  mime: JPG,
  bytes: 1 * MB,
  ...over,
});
const thumb = (position: number, over: Partial<UploadFile> = {}): UploadFile => ({
  role: "thumb",
  position,
  mime: JPG,
  bytes: 50_000,
  ...over,
});
const poster: UploadFile = { role: "poster", position: 0, mime: JPG, bytes: 9000 };
const photos = (n: number) => Array.from({ length: n }, (_, i) => [main(i), thumb(i)]).flat();
const video = (over: Partial<UploadFile> = {}) =>
  main(0, { mime: "video/mp4", bytes: 20 * MB, durationS: 30, ...over });

describe("derivePostType", () => {
  it("is photo for one image and album for 2 to 10", () => {
    expect(derivePostType([{ mime: JPG }])).toBe("photo");
    expect(derivePostType(Array(2).fill({ mime: JPG }))).toBe("album");
    expect(derivePostType(Array(10).fill({ mime: JPG }))).toBe("album");
  });
  it("is video for exactly one video", () => {
    expect(derivePostType([{ mime: "video/quicktime" }])).toBe("video");
  });
  it("is null for nothing, 11 images, 2 videos, a mix or an unknown type", () => {
    expect(derivePostType([])).toBeNull();
    expect(derivePostType(Array(11).fill({ mime: JPG }))).toBeNull();
    expect(derivePostType(Array(2).fill({ mime: "video/mp4" }))).toBeNull();
    expect(derivePostType([{ mime: JPG }, { mime: "video/mp4" }])).toBeNull();
    expect(derivePostType([{ mime: "text/html" }])).toBeNull();
  });
});

describe("uploadProblem", () => {
  it("accepts 1 to 10 photos with thumbs, and one video with an optional poster", () => {
    expect(uploadProblem(photos(1))).toBeNull();
    expect(uploadProblem(photos(10))).toBeNull();
    expect(uploadProblem([video()])).toBeNull();
    expect(uploadProblem([video(), poster])).toBeNull();
  });
  it("rejects no main file", () => {
    expect(uploadProblem([])).toMatch(/photo or a video/);
    expect(uploadProblem([thumb(0)])).toMatch(/photo or a video/);
  });
  it("rejects more than 10 photos", () => {
    expect(uploadProblem(photos(11))).toMatch(/10 photos/);
  });
  it("rejects a photo without a thumb, or a thumb for nothing", () => {
    expect(uploadProblem([main(0)])).toMatch(/thumbnail/);
    expect(uploadProblem([...photos(1), thumb(1)])).toMatch(/thumbnail/);
  });
  it("rejects gaps and duplicate positions", () => {
    expect(uploadProblem([main(1), thumb(1)])).toMatch(/order/);
    expect(uploadProblem([main(0), main(0), thumb(0)])).toMatch(/order/);
  });
  it("rejects types outside the allow-lists", () => {
    expect(uploadProblem([main(0, { mime: "image/svg+xml" }), thumb(0)])).toMatch(/type/);
    expect(uploadProblem([video({ mime: "text/html" })])).toMatch(/type/);
    expect(uploadProblem([main(0), thumb(0, { mime: "image/png" })])).toMatch(/type/);
  });
  it("rejects a mix of photos and a video", () => {
    expect(uploadProblem([...photos(1), video({ position: 1 })])).toMatch(/not both/);
  });
  it("rejects two videos, or a video away from position 0", () => {
    expect(uploadProblem([video(), video({ position: 1 })])).toMatch(/one video/);
    expect(uploadProblem([video({ position: 1 })])).toMatch(/order/);
  });
  it("rejects thumbs and a second poster on a video, and posters on photos", () => {
    expect(uploadProblem([video(), thumb(0)])).toMatch(/thumbnail/);
    expect(uploadProblem([video(), poster, poster])).toMatch(/poster/);
    expect(uploadProblem([...photos(1), poster])).toMatch(/poster/);
  });
  it("enforces the byte caps per role", () => {
    expect(uploadProblem([main(0, { bytes: 15 * MB + 1 }), thumb(0)])).toMatch(/too large/);
    expect(uploadProblem([main(0), thumb(0, { bytes: 1 * MB + 1 })])).toMatch(/too large/);
    expect(uploadProblem([video({ bytes: 100 * MB + 1 })])).toMatch(/too large/);
  });
  it("requires a video duration of at most 60 seconds", () => {
    expect(uploadProblem([video({ durationS: undefined })])).toMatch(/60 seconds/);
    expect(uploadProblem([video({ durationS: 61 })])).toMatch(/60 seconds/);
  });
});

describe("keys", () => {
  it("builds the R2 keys from CLAUDE.md", () => {
    expect(mediaKey("e", "p", { role: "main", position: 2, mime: JPG })).toBe("events/e/p/2.jpg");
    expect(mediaKey("e", "p", { role: "main", position: 0, mime: "video/quicktime" })).toBe("events/e/p/0.mov");
    expect(mediaKey("e", "p", { role: "thumb", position: 1, mime: JPG })).toBe("events/e/p/1_thumb.jpg");
    expect(mediaKey("e", "p", { role: "poster", position: 0, mime: JPG })).toBe("events/e/p/0_poster.jpg");
  });
  it("maps mimes to extensions and refuses unknown ones", () => {
    expect(extFromMime("video/webm")).toBe("webm");
    expect(extFromMime("video/mp4")).toBe("mp4");
    expect(extFromMime("image/gif")).toBeNull();
    expect(() => mediaKey("e", "p", { role: "main", position: 0, mime: "image/gif" })).toThrow();
  });
});

describe("fitWithin", () => {
  it("scales the long edge down, keeping the ratio", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 600)).toEqual({ width: 450, height: 600 });
  });
  it("never upscales", () => {
    expect(fitWithin(500, 300, 2048)).toEqual({ width: 500, height: 300 });
  });
});

describe("videoProblem", () => {
  it("explains a video that is too big or too long, and accepts the limits", () => {
    expect(videoProblem(110 * MB, 30)).toMatch(/110(\.0)? MB.*under 100 MB/);
    expect(videoProblem(10 * MB, 75)).toMatch(/75 s.*60 seconds/);
    expect(videoProblem(100 * MB, 60)).toBeNull();
  });
});

it("totalBytes sums", () => {
  expect(totalBytes([{ bytes: 1 }, { bytes: 2 }])).toBe(3);
});

describe("looksLike", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16 - b.length).fill(0)]);
  const ftyp = (brand = "ftyp") => bytes(0, 0, 0, 0x18, ...[...brand].map((c) => c.charCodeAt(0)));

  it("recognises a JPEG, an MP4, a QuickTime file and a WebM by their first bytes", () => {
    expect(looksLike("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLike("video/mp4", ftyp())).toBe(true);
    expect(looksLike("video/quicktime", ftyp())).toBe(true);
    expect(looksLike("video/quicktime", ftyp("moov"))).toBe(true);
    expect(looksLike("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });

  it("refuses anything else, including HTML or SVG claiming to be a picture", () => {
    const html = new TextEncoder().encode("<html><script>x</script></html>");
    expect(looksLike("image/jpeg", html)).toBe(false);
    expect(looksLike("video/mp4", html)).toBe(false);
    expect(looksLike("video/mp4", ftyp("moov"))).toBe(false); // plain MP4 must start with ftyp
    expect(looksLike("video/webm", bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(looksLike("image/jpeg", new Uint8Array(0))).toBe(false);
    expect(looksLike("image/svg+xml", html)).toBe(false);
  });
});

describe("the DuitNow QR", () => {
  it("is keyed under the event's admin folder with the right extension", () => {
    expect(qrKey("e1", "abc", "image/png")).toBe("events/e1/admin/qr-abc.png");
    expect(qrKey("e1", "abc", "image/jpeg")).toBe("events/e1/admin/qr-abc.jpg");
    expect(() => qrKey("e1", "abc", "image/gif")).toThrow();
  });
  it("accepts a PNG or JPEG up to 2 MB and says why otherwise", () => {
    expect(qrProblem("image/png", 1 * MB)).toBeNull();
    expect(qrProblem("image/jpeg", 2 * MB)).toBeNull();
    expect(qrProblem("image/gif", 1000)).toMatch(/PNG or JPEG/);
    expect(qrProblem("image/png", 2 * MB + 1)).toMatch(/2 MB/);
  });
  it("recognises PNG bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(looksLike("image/png", png)).toBe(true);
    expect(looksLike("image/png", new Uint8Array(12))).toBe(false);
  });
});
