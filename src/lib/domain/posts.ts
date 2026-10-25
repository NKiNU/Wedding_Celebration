/** Pure wall rules: what a card shows, how lists merge, how the cursor and counts behave. */

export type PostType = "photo" | "album" | "video" | "wish";

/** URLs are final (the server maps R2 keys to the public media domain). */
export type WallMedia = {
  kind: "image" | "video";
  url: string;
  thumbUrl: string | null;
  posterUrl: string | null;
  durationS: number | null;
};

export type WallPost = {
  id: string;
  type: PostType;
  caption: string | null;
  wishText: string | null;
  createdAt: string; // as Postgres returned it: microseconds matter for the cursor
  guestId: string;
  author: string;
  media: WallMedia[]; // in album order; at most 10
};

export type WallCounts = { all: number; photos: number; videos: number; wishes: number };

export type WallFilter = "all" | "photos" | "videos" | "wishes";

export const FILTERS: readonly { id: WallFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
  { id: "wishes", label: "Wishes" },
];

const FILTER_OF: Record<PostType, Exclude<WallFilter, "all">> = {
  photo: "photos",
  album: "photos",
  video: "videos",
  wish: "wishes",
};

export const matchesFilter = (post: Pick<WallPost, "type">, filter: WallFilter) =>
  filter === "all" || FILTER_OF[post.type] === filter;

const time = (iso: string) => Date.parse(iso);

/** Newest first, ties broken by id: the same order as the `posts_wall` index. */
const byWallOrder = (a: WallPost, b: WallPost) =>
  time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Union of lists in wall order; when an id repeats, the later list wins. */
export function mergePosts(...lists: readonly (readonly WallPost[])[]): WallPost[] {
  const byId = new Map<string, WallPost>();
  for (const list of lists) for (const p of list) byId.set(p.id, p);
  return [...byId.values()].sort(byWallOrder);
}

/**
 * Folds a freshly fetched first page into the posts already on screen.
 * - Anything on screen that the fresh page covers (as new or newer than its oldest post) but does
 *   not list is gone (hidden or deleted) and is dropped.
 * - If the newest post on screen is older than everything fresh, more than a page arrived while
 *   we were away: older loaded pages may no longer be adjacent, so the list restarts from the
 *   fresh page and `restart` tells the caller to take that page's cursor.
 * - If `complete` (the fresh page is the whole wall) nothing else can exist: it replaces the list.
 */
export function reconcileWall(
  current: readonly WallPost[],
  fresh: readonly WallPost[],
  complete = false,
): { posts: WallPost[]; restart: boolean } {
  const oldest = fresh.at(-1);
  if (complete || !oldest || current.length === 0) {
    return { posts: [...fresh], restart: complete || current.length === 0 };
  }
  const freshIds = new Set(fresh.map((p) => p.id));
  const olderThanFresh = (p: WallPost) => byWallOrder(p, oldest) > 0;
  const restart = olderThanFresh(current[0]!) && !freshIds.has(current[0]!.id);
  const kept = restart ? [] : current.filter((p) => freshIds.has(p.id) || olderThanFresh(p));
  return { posts: mergePosts(kept, fresh), restart };
}

// ---- keyset cursor -------------------------------------------------------------------------
// The cursor ends up inside a PostgREST `or=(...)` filter, so decoding is strict: only a
// Postgres-style timestamp and a UUID can get through.

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const encodeCursor = (createdAt: string, id: string) =>
  btoa(JSON.stringify([createdAt, id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed as unknown[];
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    return TIMESTAMP.test(createdAt) && UUID.test(id) ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

// ---- labels --------------------------------------------------------------------------------

export function formatDuration(seconds: number | null): string {
  const whole = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const JUST_NOW_MS = 45_000;
const RELATIVE_UNTIL_DAYS = 7;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
const shortDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

/** "5 min ago" style label; a week or more back it becomes a date. */
export function relativeTime(iso: string, now: Date): string {
  const age = now.getTime() - time(iso);
  if (age < JUST_NOW_MS) return "Just now";
  // The short style prints "5 min. ago"; the design has no full stops.
  const say = (n: number, unit: Intl.RelativeTimeFormatUnit) => rtf.format(-n, unit).replace(/\./g, "");
  if (age < HOUR) return say(Math.floor(age / MINUTE), "minute");
  if (age < DAY) return say(Math.floor(age / HOUR), "hour");
  if (age < RELATIVE_UNTIL_DAYS * DAY) return say(Math.floor(age / DAY), "day");
  return shortDate.format(new Date(time(iso)));
}

/** Image a card or thumbnail shows for the media at `index` (a video shows its poster). */
export function coverOf(post: Pick<WallPost, "media">, index = 0): string | null {
  const m = post.media[index];
  if (!m) return null;
  return (m.kind === "video" ? m.posterUrl : m.thumbUrl) ?? m.url;
}

/** What a post is called in the viewer header and the Me drawer. */
export function postLabel(post: Pick<WallPost, "type" | "media">): string {
  switch (post.type) {
    case "album":
      return `Album · ${post.media.length} photos`;
    case "photo":
      return "Photo";
    case "video":
      return "Video";
    case "wish":
      return "Wish";
  }
}
