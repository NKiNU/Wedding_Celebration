export const MB = 1024 * 1024;

export const MAX_PHOTOS = 10;
// Short clips keep the event inside the R2 free tier (10 GB). A full 30 s of default 1080p is about
// 30 MB on an iPhone (HEVC) and up to about 65 MB on Android (H.264); 80 MB fits both, 4K does not.
export const MAX_VIDEO_BYTES = 80 * MB;
export const MAX_VIDEO_SECONDS = 30;
export const POSTS_PER_HOUR = 30;
export const BYTES_PER_HOUR = 200 * MB;
export const PAGE_SIZE = 24;
export const MY_POSTS_MAX = 100; // the Me drawer lists the newest of a guest's own posts
export const NAME_MIN = 2;
export const NAME_MAX = 24;
export const MAX_NAMES_PER_PHONE = 5;

export const MAX_PHOTO_BYTES = 15 * MB;
export const MAX_AUX_IMAGE_BYTES = 1 * MB; // a thumbnail or a video poster
export const CAPTION_MAX = 120;
export const WISH_MIN = 3;
export const WISH_MAX = 300;
/** Long enough for a full-size video on slow 3G; presigned URLs expire sooner (PRESIGN_EXPIRES_S). */
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
export const ADMIN_SESSION_S = 24 * 60 * 60;
export const ADMIN_LOGIN_MAX = 5; // wrong passcodes per IP per window
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60_000;

// Defaults; each can be changed with an env var of the same name (env.ts).
// New names per address per window. Generous on purpose: a whole venue often shares one Wi-Fi
// address, and guests join together when the MC says "scan now". It slows a scripted name flood.
export const GUEST_JOINS_PER_IP = 300;
export const GUEST_JOIN_WINDOW_MS = 10 * 60_000;
export const MAX_EVENT_MB = 9 * 1024; // all posted media of the event: stays inside the R2 free tier (10 GB)
