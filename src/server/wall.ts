import "server-only";
import { MY_POSTS_MAX, PAGE_SIZE } from "@/lib/domain/limits";
import {
  decodeCursor,
  encodeCursor,
  type PostType,
  type WallCounts,
  type WallMedia,
  type WallPost,
} from "@/lib/domain/posts";
import { db } from "./db";
import { env } from "./env";
import { getEvent } from "./event";
import { AppError } from "./http";

export const SELECT =
  "id, type, caption, wish_text, created_at, guest_id, guests(name), " +
  "post_media(kind, path, thumb_path, poster_path, duration_s)";

type MediaRow = {
  kind: string;
  path: string;
  thumb_path: string | null;
  poster_path: string | null;
  duration_s: number | string | null; // numeric columns arrive as numbers or strings
};

export type PostRow = {
  id: string;
  type: PostType;
  caption: string | null;
  wish_text: string | null;
  created_at: string;
  guest_id: string;
  guests: { name: string } | null;
  post_media: MediaRow[];
};

const mediaUrl = (key: string | null) =>
  key === null ? null : `${env().NEXT_PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`;

const toMedia = (m: MediaRow): WallMedia => ({
  kind: m.kind === "video" ? "video" : "image",
  url: mediaUrl(m.path)!,
  thumbUrl: mediaUrl(m.thumb_path),
  posterUrl: mediaUrl(m.poster_path),
  durationS: m.duration_s === null ? null : Number(m.duration_s),
});

export const toPost = (row: PostRow): WallPost => ({
  id: row.id,
  type: row.type,
  caption: row.caption,
  wishText: row.wish_text,
  createdAt: row.created_at,
  guestId: row.guest_id,
  author: row.guests?.name ?? "Guest",
  media: row.post_media.map(toMedia),
});

/**
 * Posts guests can see. The service role bypasses RLS, so `hidden = false` is asked for
 * explicitly; the same rule is what the anon policy enforces for Realtime.
 */
const visiblePosts = (eventId: string) =>
  db().from("posts").select(SELECT).eq("event_id", eventId).eq("hidden", false);

/** Row-value comparison (created_at, id) < (c, i), spelled the way PostgREST allows. */
export const afterCursor = (after: { createdAt: string; id: string }) =>
  `created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`;

/** One page of the wall, newest first. */
export async function getWallPage(cursor: string | null) {
  const after = cursor === null ? null : decodeCursor(cursor);
  if (cursor !== null && !after) throw new AppError("invalid_cursor", 400, "That page link is not valid.");

  const event = await getEvent();
  let query = visiblePosts(event.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "post_media" })
    .limit(PAGE_SIZE + 1); // the extra row only tells us whether another page exists
  if (after) {
    query = query.or(afterCursor(after));
  }
  const { data, error } = await query;
  if (error) throw new Error(`Loading the wall failed: ${error.code} ${error.message}`);

  const rows = data as unknown as PostRow[];
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    posts: page.map(toPost),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

/** One visible post for the viewer; null when it is hidden, deleted or not in this event. */
export async function getPost(id: string): Promise<WallPost | null> {
  const event = await getEvent();
  const { data, error } = await visiblePosts(event.id)
    .eq("id", id)
    .order("position", { referencedTable: "post_media" })
    .maybeSingle();
  if (error) throw new Error(`Loading the post failed: ${error.code} ${error.message}`);
  return data ? toPost(data as unknown as PostRow) : null;
}

/**
 * A guest's own visible posts for the Me drawer, newest first.
 * ponytail: the newest MY_POSTS_MAX only; add a cursor if a guest ever shares more than that.
 */
export async function getMyPosts(guestId: string): Promise<WallPost[]> {
  const event = await getEvent();
  const { data, error } = await visiblePosts(event.id)
    .eq("guest_id", guestId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "post_media" })
    .limit(MY_POSTS_MAX);
  if (error) throw new Error(`Loading your posts failed: ${error.code} ${error.message}`);
  return (data as unknown as PostRow[]).map(toPost);
}

/** Filter-pill counts, computed by the database so they stay right past the loaded pages. */
export async function getWallCounts(): Promise<WallCounts> {
  const { data, error } = await db().rpc("wall_counts", { e: (await getEvent()).id });
  if (error) throw new Error(`Loading wall counts failed: ${error.code ?? ""} ${error.message}`);
  const row = data[0];
  return {
    all: row?.all_count ?? 0,
    photos: row?.photos ?? 0,
    videos: row?.videos ?? 0,
    wishes: row?.wishes ?? 0,
  };
}
