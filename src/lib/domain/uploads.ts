/** Pure upload rules shared by the browser (early checks) and the server (the authority). */
import {
  IMAGE_MIMES,
  MAX_AUX_IMAGE_BYTES,
  MAX_PHOTO_BYTES,
  MAX_MONOGRAM_BYTES,
  MAX_PHOTOS,
  MAX_QR_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MB,
  MAX_STRIP_TEMPLATE_BYTES,
  MONOGRAM_MIMES,
  QR_MIMES,
  STRIP_TEMPLATE_MIMES,
  VIDEO_MIMES,
} from "./limits";
import { STRIP_OUT_H, STRIP_OUT_W, STRIP_OUTPUT_SCALE, STRIP_WINDOWS, TEMPLATE_H, TEMPLATE_W } from "./strip";

export type FileRole = "main" | "thumb" | "poster";

/** What the client declares for each file it wants to upload. Sizes are signed into the URL. */
export type UploadFile = {
  role: FileRole;
  position: number;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationS?: number;
};

/** An `UploadFile` once the server has chosen its R2 key. */
export type StoredFile = UploadFile & { key: string };

const JPEG = "image/jpeg";
const isImage = (mime: string) => (IMAGE_MIMES as readonly string[]).includes(mime);
const isVideo = (mime: string) => (VIDEO_MIMES as readonly string[]).includes(mime);

export type UploadLayout = "strip";

/**
 * Post type from the verified main files: never from anything the client calls its type. A strip
 * is the one layout the phone asks for (the files of a strip and of an album look alike); it is
 * granted only when the files have the exact strip shape, see `stripShapeProblem`.
 */
export function derivePostType(
  mains: readonly { mime: string; position?: number }[],
  layout: UploadLayout | null = null,
): "photo" | "album" | "video" | "strip" | null {
  if (layout === "strip") return stripMainsOk(mains) ? "strip" : null;
  if (mains.length === 0) return null;
  if (mains.every((m) => isImage(m.mime))) {
    if (mains.length === 1) return "photo";
    return mains.length <= MAX_PHOTOS ? "album" : null;
  }
  return mains.length === 1 && isVideo(mains[0]!.mime) ? "video" : null;
}

/** A strip: the finished image at position 0, then the 3 photos, all JPEG. */
export const STRIP_MAINS = 1 + STRIP_WINDOWS;
const stripMainsOk = (mains: readonly { mime: string; position?: number }[]) =>
  mains.length === STRIP_MAINS && mains.every((m) => m.mime === JPEG);

/** Why these files cannot be a photo strip, or null. Runs after `uploadProblem`. */
export function stripShapeProblem(files: readonly UploadFile[]): string | null {
  const mains = files.filter((f) => f.role === "main");
  if (!stripMainsOk(mains)) return `A photo strip needs ${STRIP_WINDOWS} photos.`;
  const finished = mains.find((m) => m.position === 0);
  // 1x is what phones with an older copy of the page still send; 2x is what the app makes now.
  const sized = [1, STRIP_OUTPUT_SCALE].some((k) => finished?.width === TEMPLATE_W * k && finished.height === TEMPLATE_H * k);
  if (!sized) return `The finished strip must be ${TEMPLATE_W} × ${TEMPLATE_H} or ${STRIP_OUT_W} × ${STRIP_OUT_H}.`;
  return null;
}

const EXT: Record<string, "jpg" | "mp4" | "mov" | "webm"> = {
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const extFromMime = (mime: string) => EXT[mime] ?? null;

const QR_EXT: Record<string, "png" | "jpg"> = { "image/png": "png", "image/jpeg": "jpg" };

/** `events/{event}/admin/qr-{id}.{ext}`: the DuitNow QR the admin uploads. */
export const qrKey = (eventId: string, id: string, mime: string): string => {
  const ext = QR_EXT[mime];
  if (!ext) throw new Error(`No extension for ${mime}`);
  return `events/${eventId}/admin/qr-${id}.${ext}`;
};

/** Why this file cannot be the QR, or null when it can. */
export function qrProblem(mime: string, bytes: number): string | null {
  if (!(QR_MIMES as readonly string[]).includes(mime)) return "The QR must be a PNG or JPEG image.";
  return bytes > MAX_QR_BYTES ? "The QR image must be under 2 MB." : null;
}

const MONOGRAM_EXT: Record<string, "png" | "webp" | "svg"> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** `events/{event}/admin/monogram-{id}.{ext}`: the admin's replacement for the "&" monogram. */
export const monogramKey = (eventId: string, id: string, mime: string): string => {
  const ext = MONOGRAM_EXT[mime];
  if (!ext) throw new Error(`No extension for ${mime}`);
  return `events/${eventId}/admin/monogram-${id}.${ext}`;
};

/** The monogram's type from its key's extension, or null for anything else. */
export function monogramMime(key: string): string | null {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  return Object.keys(MONOGRAM_EXT).find((mime) => MONOGRAM_EXT[mime] === ext) ?? null;
}

/** Why this file cannot be the monogram, or null when it can. */
export function monogramProblem(mime: string, bytes: number): string | null {
  if (!(MONOGRAM_MIMES as readonly string[]).includes(mime)) return "The monogram must be a PNG, WebP or SVG image.";
  return bytes > MAX_MONOGRAM_BYTES ? "The monogram image must be under 1 MB." : null;
}

/** `events/{event}/admin/strip-{id}.{ext}`: the admin's photo strip template. */
export const stripTemplateKey = (eventId: string, id: string, mime: string): string => {
  const ext = QR_EXT[mime];
  if (!ext) throw new Error(`No extension for ${mime}`);
  return `events/${eventId}/admin/strip-${id}.${ext}`;
};

/** The template's type from its key's extension. */
export const stripTemplateMime = (key: string) => (key.endsWith(".png") ? "image/png" : "image/jpeg");

/** Why this file cannot be the strip template, or null when it can. */
export function stripTemplateProblem(mime: string, bytes: number): string | null {
  if (!(STRIP_TEMPLATE_MIMES as readonly string[]).includes(mime)) return "The template must be a PNG or JPG image.";
  return bytes > MAX_STRIP_TEMPLATE_BYTES
    ? `The template must be under ${MAX_STRIP_TEMPLATE_BYTES / MB} MB. Try exporting it as JPG.`
    : null;
}

/**
 * Pixel size from a PNG's IHDR or a JPEG's SOFn header, or null when the bytes are neither.
 * `bytes` must reach the header: the first 24 bytes for a PNG, past any EXIF segments for a JPEG.
 */
export function imageSizeOf(bytes: Uint8Array): { w: number; h: number } | null {
  const u16 = (i: number) => (bytes[i]! << 8) | bytes[i + 1]!;
  const u32 = (i: number) => u16(i) * 0x10000 + u16(i + 2);
  if (looksLike("image/png", bytes) && bytes.length >= 24 && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR") {
    return { w: u32(16), h: u32(20) };
  }
  if (!looksLike("image/jpeg", bytes)) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2; // no length
      continue;
    }
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return i + 8 < bytes.length ? { w: u16(i + 7), h: u16(i + 5) } : null;
    }
    i += 2 + u16(i + 2);
  }
  return null;
}

/**
 * An SVG can carry script or pull in remote files, so the text is scanned before it is stored.
 * Each rule is one linear regex (no nested quantifiers), safe on a 1 MB input. `href` also covers
 * `xlink:href`; `data:` and `#id` targets pass. ponytail: a substring scan, not an XML parser;
 * the file is also served as an image, where browsers run no script.
 */
const SVG_FORBIDDEN: readonly RegExp[] = [
  /<(?:[\w.-]+:)?script/i,
  /[\s"'/]on\w+\s*=/i,
  /<(?:[\w.-]+:)?foreignObject/i,
  /&#/, // character references can spell out `https:` or `javascript:`
  /javascript:/i,
  /<!ENTITY/i,
  /@import/i,
  /(?:href\s*=|url\()\s*(?:["']\s*)?(?:https?:|\/\/)/i,
];

const SVG_UNSAFE = "That SVG contains something that isn’t allowed.";
export const NOT_SVG = "That file is not an SVG image.";

export function svgProblem(text: string): string | null {
  if (!/<svg/i.test(text)) return NOT_SVG;
  return SVG_FORBIDDEN.some((rule) => rule.test(text)) ? SVG_UNSAFE : null;
}

const XML_ENCODING = /^\s*<\?xml[^>]*\sencoding\s*=\s*["']([^"']*)["']/i;

/**
 * `svgProblem` on raw bytes. Only strict UTF-8 is scanned: a NUL, an ESC (ISO-2022 escapes can split
 * `<scr` + ESC(B + `ipt`) past the scan) or a declared non-UTF-8 encoding makes the text unsafe.
 * Binary that is not UTF-8 text at all (a renamed PNG) is NOT_SVG.
 */
export function svgBytesProblem(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return NOT_SVG;
  }
  if (text.includes("\u0000")) return NOT_SVG;
  if (text.includes("\u001b")) return SVG_UNSAFE;
  const encoding = XML_ENCODING.exec(text)?.[1];
  if (encoding !== undefined && encoding.trim().toLowerCase() !== "utf-8") return SVG_UNSAFE;
  return svgProblem(text);
}

/** `events/{event}/{post}/{position}.{ext}`, `{position}_thumb.jpg`, `{position}_poster.jpg`. */
export function mediaKey(
  eventId: string,
  postId: string,
  f: Pick<UploadFile, "role" | "position" | "mime">,
): string {
  const base = `events/${eventId}/${postId}/${f.position}`;
  if (f.role === "thumb") return `${base}_thumb.jpg`;
  if (f.role === "poster") return `${base}_poster.jpg`;
  const ext = extFromMime(f.mime);
  if (!ext) throw new Error(`No extension for ${f.mime}`);
  return `${base}.${ext}`;
}

/** Size to draw an image at: the long edge capped, the ratio kept, never enlarged. */
export function fitWithin(width: number, height: number, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const QUICKTIME_ATOMS = ["ftyp", "moov", "mdat", "wide", "free", "skip"];

/**
 * The first bytes of a stored file must match its declared type, so arbitrary bytes cannot be
 * served from the media domain as a photo or a video. `start` is at least the first 12 bytes.
 */
export function looksLike(mime: string, start: Uint8Array): boolean {
  const text = (from: number, length: number) => String.fromCharCode(...start.slice(from, from + length));
  switch (mime) {
    case "image/jpeg":
      return start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47].every((b, i) => start[i] === b);
    case "image/webp":
      return text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
    case "video/mp4":
      return text(4, 4) === "ftyp";
    case "video/quicktime":
      return QUICKTIME_ATOMS.includes(text(4, 4)); // a QuickTime file need not start with ftyp
    case "video/webm":
      return start[0] === 0x1a && start[1] === 0x45 && start[2] === 0xdf && start[3] === 0xa3;
    default:
      return false;
  }
}

export const totalBytes = (files: readonly { bytes: number }[]) =>
  files.reduce((sum, f) => sum + f.bytes, 0);

const mbLabel = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

/** Friendly text for a video that is over the limits, or null. */
export function videoProblem(bytes: number, durationS: number): string | null {
  if (bytes > MAX_VIDEO_BYTES) {
    return `That video is ${mbLabel(bytes)}. Please choose one under ${MAX_VIDEO_BYTES / MB} MB (about ${MAX_VIDEO_SECONDS} seconds). Tip: record in 1080p, not 4K.`;
  }
  if (durationS > MAX_VIDEO_SECONDS) {
    return `That video is ${Math.round(durationS)} s. Please choose one up to ${MAX_VIDEO_SECONDS} seconds. You can trim it in your phone’s Photos or Gallery app first.`;
  }
  return null;
}

const positionsOk = (mains: readonly UploadFile[]) =>
  mains.every((m) => mains.filter((o) => o.position === m.position).length === 1) &&
  mains.every((m) => m.position >= 0 && m.position < mains.length);

/** Why this set of files cannot become a post, or null when it can. */
export function uploadProblem(files: readonly UploadFile[]): string | null {
  const of = (role: FileRole) => files.filter((f) => f.role === role);
  const [mains, thumbs, posters] = [of("main"), of("thumb"), of("poster")];
  if (mains.length === 0) return "Choose at least one photo or a video.";
  if (mains.some((m) => !isImage(m.mime) && !isVideo(m.mime)) || [...thumbs, ...posters].some((f) => f.mime !== JPEG)) {
    return "That file type isn’t supported.";
  }
  const videos = mains.filter((m) => isVideo(m.mime));
  if (videos.length > 0 && videos.length < mains.length) return "Post photos or a video, not both.";

  if (videos.length > 0) {
    if (videos.length > 1) return "Only one video per post.";
    if (videos[0]!.position !== 0 || posters.some((p) => p.position !== 0)) return "Files are out of order.";
    if (thumbs.length > 0) return "A video can’t have a photo thumbnail.";
    if (posters.length > 1) return "A video takes at most one poster.";
    if (videos[0]!.bytes > MAX_VIDEO_BYTES || posters.some((p) => p.bytes > MAX_AUX_IMAGE_BYTES)) {
      return "A file is too large.";
    }
    const seconds = videos[0]!.durationS;
    return seconds === undefined || seconds > MAX_VIDEO_SECONDS ? `Videos can be up to ${MAX_VIDEO_SECONDS} seconds.` : null;
  }

  if (mains.length > MAX_PHOTOS) return `Up to ${MAX_PHOTOS} photos per post.`;
  if (posters.length > 0) return "Photos don’t take a poster.";
  if (!positionsOk(mains)) return "Photos are out of order.";
  if (thumbs.length !== mains.length || !positionsOk(thumbs)) return "Every photo needs one thumbnail.";
  if (mains.some((m) => m.bytes > MAX_PHOTO_BYTES) || thumbs.some((t) => t.bytes > MAX_AUX_IMAGE_BYTES)) {
    return "A file is too large.";
  }
  return null;
}
