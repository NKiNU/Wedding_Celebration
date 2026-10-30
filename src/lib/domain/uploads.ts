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
  MONOGRAM_MIMES,
  QR_MIMES,
  VIDEO_MIMES,
} from "./limits";

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

/** Post type from the verified main files: never from anything the client calls its type. */
export function derivePostType(mains: readonly { mime: string }[]): "photo" | "album" | "video" | null {
  if (mains.length === 0) return null;
  if (mains.every((m) => isImage(m.mime))) {
    if (mains.length === 1) return "photo";
    return mains.length <= MAX_PHOTOS ? "album" : null;
  }
  return mains.length === 1 && isVideo(mains[0]!.mime) ? "video" : null;
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
    return `That video is ${mbLabel(bytes)}. Please choose one under 100 MB (about 60 seconds).`;
  }
  if (durationS > MAX_VIDEO_SECONDS) {
    return `That video is ${Math.round(durationS)} s. Please choose one up to ${MAX_VIDEO_SECONDS} seconds.`;
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
