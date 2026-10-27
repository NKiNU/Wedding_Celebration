export const MB = 1024 * 1024;

export const MAX_PHOTOS = 10;
export const MAX_VIDEO_BYTES = 100 * MB;
export const MAX_VIDEO_SECONDS = 60;
export const POSTS_PER_HOUR = 30;
export const BYTES_PER_HOUR = 200 * MB;
export const PAGE_SIZE = 24;
export const TICKER_WISHES = 5; // the newest wishes the wall header rotates through
export const MY_POSTS_MAX = 100; // the Me drawer lists the newest of a guest's own posts
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
export const QR_MIMES = ["image/png", "image/jpeg"] as const;
export const MAX_QR_BYTES = 2 * MB;
/**
 * Flood guards, per client address. A venue's guests share one Wi-Fi address and every open phone
 * refetches the wall on each new post, so these are ceilings against floods, not fairness limits.
 * MAX_GUESTS_PER_EVENT only protects the table: filling it needs about 33 hours of joins from one
 * address (JOINS_PER_IP_PER_HOUR), and the junk rows can be deleted in SQL (docs/DEPLOY.md).
 */
export const API_RATE_WINDOW_MS = 60_000;
export const API_RATE_HOUR_MS = 60 * 60_000;
export const JOINS_PER_IP_PER_WINDOW = 300;
export const JOINS_PER_IP_PER_HOUR = 600;
export const WALL_READS_PER_IP_PER_WINDOW = 6000;
export const MAX_GUESTS_PER_EVENT = 20_000;
export const QR_FETCH_TIMEOUT_MS = 10_000;
export const ADMIN_SESSION_S = 24 * 60 * 60;
export const ADMIN_LOGIN_MAX = 5; // wrong passcodes per IP per window
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60_000;
