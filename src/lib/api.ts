import type { WallCounts, WallPost } from "./domain/posts";
import type { FileRole } from "./domain/uploads";

export type KnownGuest = { guestId: string; name: string };
export type Session = { active: KnownGuest | null; known: KnownGuest[] };

/** GET /api/posts: `counts` is only sent with the first page. */
export type WallResponse = { posts: WallPost[]; nextCursor: string | null; counts: WallCounts | null };

/** POST /api/uploads: one presigned PUT URL per requested file. */
export type UploadIntent = { postId: string; uploads: { role: FileRole; position: number; url: string }[] };

/** A post as the admin sees it: hidden ones are listed too. */
export type AdminPost = WallPost & { hidden: boolean };
export type AdminPostsResponse = { posts: AdminPost[]; nextCursor: string | null };

/** The event as the admin edits it. `qrUrl` is the same-origin `/qr` while a QR exists. */
export type AdminEvent = {
  groomName: string;
  brideName: string;
  headerMessage: string;
  uploadsOpen: boolean;
  qrAccountName: string;
  qrBank: string;
  hasQr: boolean;
};

/** POST /api/admin/qr: where to PUT the image, and the key to confirm afterwards. */
export type QrUpload = { key: string; url: string };

/** One file for the "download everything" zip. */
export type ManifestEntry = { url: string; name: string };

/** POST /api/posts */
export type CreatedPost = { id: string };

export type ApiError = { code: string; message: string; details?: Record<string, unknown> };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** A hung request on flaky venue wifi must end, or the form stays disabled until a reload. */
export const REQUEST_TIMEOUT_MS = 15_000;

const UNREACHABLE: ApiError = {
  code: "network",
  message: "Can’t reach the server. Check your connection and try again.",
};

/** Calls one of our route handlers. Never throws: a failed request is an `ok: false` result. */
export async function api<T>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}
