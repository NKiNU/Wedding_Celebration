import "server-only";
import type { CreatedPost } from "@/lib/api";
import type { Json } from "@/lib/database.types";
import { derivePostType, looksLike, type StoredFile } from "@/lib/domain/uploads";
import { db } from "./db";
import { getEvent } from "./event";
import { AppError } from "./http";
import type { Guest } from "./identity";
import { r2 } from "./r2";
import { assertUploadsOpen, limitArgs, rateLimited, storedFilesOf } from "./uploads";

export async function createWish(guest: Guest, wishText: string): Promise<CreatedPost> {
  assertUploadsOpen(await getEvent());
  const { data, error } = await db().rpc("create_wish", {
    p_event_id: guest.eventId,
    p_guest_id: guest.id,
    p_text: wishText,
    ...limitArgs(),
  });
  if (error?.code === "PT429") throw rateLimited();
  if (error) throw new Error(`Creating the wish failed: ${error.code} ${error.message}`);
  return { id: data };
}

/**
 * Takes a post down. With `ownerId` (a guest deleting their own post) ownership is by token, never
 * by name; without it the caller is the admin, already authenticated. The files go first: if
 * storage fails the row stays and the caller can try again, whereas a row that went first would
 * leave files nobody can reach. Storage ignores keys that are already gone.
 * A presigned PUT stays valid for PRESIGN_EXPIRES_S after posting and could re-create a deleted
 * file, so the intent goes back to being a tombstone: the sweep removes the keys again once the URLs
 * are dead. (The conditional-PUT item in the Phase 3 notes would not stop that on its own.)
 */
async function removePost(eventId: string, postId: string, ownerId?: string): Promise<void> {
  const { data, error } = await db()
    .from("posts")
    .select("guest_id, post_media(path, thumb_path, poster_path)")
    .eq("id", postId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Loading the post failed: ${error.code} ${error.message}`);
  if (!data) throw new AppError("post_not_found", 404, "That post is already gone.");
  if (ownerId !== undefined && data.guest_id !== ownerId) {
    throw new AppError("not_yours", 403, "You can only delete your own posts.");
  }

  const keys = data.post_media.flatMap((m) =>
    [m.path, m.thumb_path, m.poster_path].filter((key): key is string => key !== null),
  );
  if (keys.length > 0) await r2().deleteMany(keys);

  const row = db().from("posts").delete().eq("id", postId);
  const { error: removing } = await (ownerId === undefined ? row : row.eq("guest_id", ownerId));
  if (removing) throw new Error(`Deleting the post failed: ${removing.code} ${removing.message}`);
  if (keys.length === 0) return; // a wish has no upload intent

  // The post is gone either way: a failure here only delays the sweep's second pass, so it is logged.
  const intent = db()
    .from("upload_intents")
    .update({ consumed_at: null, cancelled_at: new Date().toISOString() })
    .eq("post_id", postId);
  const { error: tombstone } = await (ownerId === undefined ? intent : intent.eq("guest_id", ownerId));
  if (tombstone) console.error("Tombstoning a deleted post's upload failed", postId, tombstone.code, tombstone.message);
}

/** The author takes their own post down. */
export const deletePost = (guest: Guest, postId: string): Promise<void> =>
  removePost(guest.eventId, postId, guest.id);

/** The admin takes any post of this event down (moderation). */
export const deletePostAsAdmin = (eventId: string, postId: string): Promise<void> =>
  removePost(eventId, postId);

const baseType = (mime: string) => mime.split(";")[0]!.trim().toLowerCase();

const incomplete = () =>
  new AppError("upload_incomplete", 400, "Some files didn’t finish uploading. Please try again.");

/**
 * Every file the intent declared must be in R2 with exactly the declared size and type, no header
 * overrides, and the first bytes of what that type is (so a "JPEG" is a JPEG).
 */
async function assertUploaded(files: readonly StoredFile[]): Promise<void> {
  const bucket = r2();
  const complete = await Promise.all(
    files.map(async (f) => {
      const object = await bucket.head(f.key);
      if (!object || object.overridden || object.bytes !== f.bytes || baseType(object.mime) !== f.mime) return false;
      const start = await bucket.peek(f.key);
      return start !== null && looksLike(f.mime, start);
    }),
  );
  if (!complete.every(Boolean)) throw incomplete();
}

/** One `post_media` row per main file, with the thumb or poster that belongs to its position. */
function toMedia(files: readonly StoredFile[]) {
  const keyOf = (role: StoredFile["role"], position: number) =>
    files.find((f) => f.role === role && f.position === position)?.key ?? null;
  return files
    .filter((f) => f.role === "main")
    .sort((a, b) => a.position - b.position)
    .map((f) => ({
      position: f.position,
      kind: f.mime.startsWith("video/") ? "video" : "image",
      path: f.key,
      thumb_path: keyOf("thumb", f.position),
      poster_path: keyOf("poster", f.position),
      width: f.width ?? null,
      height: f.height ?? null,
      duration_s: f.durationS ?? null,
      bytes: f.bytes,
      mime: f.mime,
    }));
}

/** Expired or cancelled: free the objects now; the row stays (it still counts) for the sweep. */
async function expire(files: readonly StoredFile[]): Promise<never> {
  await r2().deleteMany(files.map((f) => f.key));
  throw new AppError("intent_expired", 410, "That took too long. Please choose your files again.");
}

/**
 * Turns an upload intent into a post. The type comes from the verified files of the intent, never
 * from the request, and a repeated submit (lost response, double tap) returns the same post.
 */
export async function createMediaPost(guest: Guest, postId: string, caption: string | null): Promise<CreatedPost> {
  const { data: intent, error: lookup } = await db()
    .from("upload_intents")
    .select("files, consumed_at, cancelled_at, expires_at")
    .eq("post_id", postId)
    .eq("guest_id", guest.id)
    .maybeSingle();
  if (lookup) throw new Error(`Loading the upload intent failed: ${lookup.code} ${lookup.message}`);
  if (!intent) throw new AppError("intent_not_found", 404, "We couldn’t find that upload.");
  if (intent.consumed_at) return { id: postId };

  assertUploadsOpen(await getEvent());
  const files = storedFilesOf(intent.files);
  // A cancelled or expired intent can never become a post (the database says so too, below).
  if (intent.cancelled_at || Date.parse(intent.expires_at) <= Date.now()) await expire(files);
  await assertUploaded(files);
  const media = toMedia(files);
  const type = derivePostType(media);
  if (!type) throw new AppError("invalid_media", 400, "Those files can’t be posted together.");

  const { error } = await db().rpc("create_post_from_intent", {
    p_post_id: postId,
    p_guest_id: guest.id,
    p_type: type,
    p_caption: caption as string, // the generated type drops the SQL nullability; null is valid
    p_media: media as unknown as Json,
  });
  if (!error) return { id: postId };

  // The function raises PTxxx codes (migration 0001); PostgREST passes them through as `code`.
  switch (error.code) {
    case "PT409":
      return { id: postId }; // a concurrent submit won; the post exists
    case "PT404":
      throw new AppError("intent_not_found", 404, "We couldn’t find that upload.");
    case "PT410":
      return expire(files);
    case "PT400":
      console.error("create_post_from_intent rejected media", postId, error.message);
      throw new AppError("invalid_media", 400, "Those files can’t be posted together.");
    default:
      // The objects stay: the failure may be transient, the client cancels, and the sweep is the backstop.
      throw new Error(`Creating the post failed: ${error.code} ${error.message}`);
  }
}
