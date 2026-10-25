/** Browser-side media prep: resize photos, read video metadata, grab a poster frame. */
import { IMAGE_LONG_EDGE, JPEG_QUALITY, POSTER_AT_S, THUMB_LONG_EDGE } from "./domain/limits";
import { fitWithin, videoProblem } from "./domain/uploads";

export class MediaError extends Error {}

export type PreparedPhoto = { main: Blob; thumb: Blob; width: number; height: number };
export type PreparedVideo = { file: File; poster: Blob | null; width: number; height: number; durationS: number };

const PHOTO_UNREADABLE = "This photo can’t be read. Try another one.";
const VIDEO_UNREADABLE = "This video can’t be read. Try another one.";
const VIDEO_READ_TIMEOUT_MS = 10_000;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decodePhoto(file: File): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    // iOS and some HEIC files reject createImageBitmap options; <img> decodes them.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new MediaError(PHOTO_UNREADABLE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawToJpeg(source: CanvasImageSource, width: number, height: number, failure: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaError(failure);
    ctx.drawImage(source, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaError(failure))), "image/jpeg", JPEG_QUALITY),
    );
  } finally {
    canvas.width = 0; // iOS keeps canvas memory alive until it is shrunk
  }
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const img = await decodePhoto(file);
  try {
    const main = fitWithin(img.width, img.height, IMAGE_LONG_EDGE);
    const thumb = fitWithin(img.width, img.height, THUMB_LONG_EDGE);
    return {
      main: await drawToJpeg(img.source, main.width, main.height, PHOTO_UNREADABLE),
      thumb: await drawToJpeg(img.source, thumb.width, thumb.height, PHOTO_UNREADABLE),
      ...main,
    };
  } finally {
    img.close();
  }
}

export function prepareVideo(file: File): Promise<PreparedVideo> {
  const tooBig = videoProblem(file.size, 0);
  if (tooBig) return Promise.reject(new MediaError(tooBig));

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  return new Promise<PreparedVideo>((resolve, reject) => {
    let meta: Omit<PreparedVideo, "poster"> | null = null;

    const settle = (outcome: PreparedVideo | MediaError) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      if (outcome instanceof MediaError) reject(outcome);
      else resolve(outcome);
    };
    // Once we know the video is fine, a missing poster must not fail the post.
    const fail = (error: MediaError) => settle(meta ? { ...meta, poster: null } : error);
    const timer = setTimeout(() => fail(new MediaError(VIDEO_UNREADABLE)), VIDEO_READ_TIMEOUT_MS);

    video.addEventListener("error", () => fail(new MediaError(VIDEO_UNREADABLE)));
    video.addEventListener("loadedmetadata", () => {
      const durationS = video.duration;
      if (!Number.isFinite(durationS)) return fail(new MediaError(VIDEO_UNREADABLE));
      const problem = videoProblem(file.size, durationS);
      if (problem) return fail(new MediaError(problem));
      meta = { file, width: video.videoWidth, height: video.videoHeight, durationS };
      video.currentTime = Math.min(POSTER_AT_S, durationS / 2);
    });
    video.addEventListener("seeked", () => {
      if (!meta) return;
      const { width, height } = fitWithin(meta.width, meta.height, THUMB_LONG_EDGE);
      drawToJpeg(video, width, height, VIDEO_UNREADABLE).then(
        (poster) => settle({ ...meta!, poster }),
        () => settle({ ...meta!, poster: null }),
      );
    });
    video.src = url;
  });
}
