export const MB = 1024 * 1024;

export const MAX_PHOTOS = 10;
export const MAX_VIDEO_BYTES = 100 * MB;
export const MAX_VIDEO_SECONDS = 60;
export const POSTS_PER_HOUR = 30;
export const BYTES_PER_HOUR = 200 * MB;
export const PAGE_SIZE = 24;
export const NAME_MIN = 2;
export const NAME_MAX = 24;
export const MAX_NAMES_PER_PHONE = 5;

export const MAX_PHOTO_BYTES = 15 * MB;
export const MAX_AUX_IMAGE_BYTES = 1 * MB; // a thumbnail or a video poster
export const CAPTION_MAX = 120;
export const WISH_MIN = 3;
export const WISH_MAX = 300;
/** Long enough for a 100 MB video on slow 3G; presigned URLs expire sooner (PRESIGN_EXPIRES_S). */
export const INTENT_TTL_MS = 60 * 60_000;
export const PRESIGN_EXPIRES_S = 15 * 60;
export const RATE_WINDOW_MS = 60 * 60_000;
export const IMAGE_LONG_EDGE = 2048;
export const THUMB_LONG_EDGE = 600;
export const JPEG_QUALITY = 0.82;
export const POSTER_AT_S = 0.5;
export const IMAGE_MIMES = ["image/jpeg"] as const; // the client always re-encodes to JPEG
export const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
