import "server-only";
import type { CreatedPost } from "@/lib/api";
import type { Json } from "@/lib/database.types";
import { derivePostType, type StoredFile } from "@/lib/domain/uploads";
import { storedFiles } from "@/lib/validation";
import { db } from "./db";
import { getEvent } from "./event";
import { AppError } from "./http";
import type { Guest } from "./identity";
import { r2 } from "./r2";
import { assertUploadsOpen, assertWithinRateLimit, discardIntent } from "./uploads";

export async function createWish(guest: Guest, wishText: string): Promise<CreatedPost> {
  assertUploadsOpen(await getEvent());
  await assertWithinRateLimit(guest.id, { posts: 1, bytes: 0 });
  const { data, error } = await db()
    .from("posts")
    .insert({ event_id: guest.eventId, guest_id: guest.id, type: "wish", wish_text: wishText })
    .select("id")
    .single();
  if (error) throw new Error(`Creating the wish failed: ${error.code} ${error.message}`);
  return { id: data.id };
}

const baseType = (mime: string) => mime.split(";")[0]!.trim().toLowerCase();

const incomplete = () =>
  new AppError("upload_incomplete", 400, "Some files didn’t finish uploading. Please try again.");

/** Every file the intent declared must be in R2 with exactly the declared size and type, and no header overrides. */
async function assertUploaded(files: readonly StoredFile[]): Promise<void> {
  const bucket = r2();
  const found = await Promise.all(files.map((f) => bucket.head(f.key)));
  const complete = files.every((f, i) => {
    const object = found[i];
    return (
      object !== null &&
      object !== undefined &&
      !object.overridden &&
      object.bytes === f.bytes &&
      baseType(object.mime) === f.mime
    );
  });
  if (!complete) throw incomplete();
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

/**
 * Turns an upload intent into a post. The type comes from the verified files of the intent, never
 * from the request, and a repeated submit (lost response, double tap) returns the same post.
 */
export async function createMediaPost(guest: Guest, postId: string, caption: string | null): Promise<CreatedPost> {
  const { data: intent, error: lookup } = await db()
    .from("upload_intents")
    .select("files, consumed_at")
    .eq("post_id", postId)
    .eq("guest_id", guest.id)
    .maybeSingle();
  if (lookup) throw new Error(`Loading the upload intent failed: ${lookup.code} ${lookup.message}`);
  if (!intent) throw new AppError("intent_not_found", 404, "We couldn’t find that upload.");
  if (intent.consumed_at) return { id: postId };

  assertUploadsOpen(await getEvent());
  const files = storedFiles.parse(intent.files);
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
      await discardIntent(postId, files.map((f) => f.key));
      throw new AppError("intent_expired", 410, "That took too long. Please choose your files again.");
    case "PT400":
      console.error("create_post_from_intent rejected media", postId, error.message);
      throw new AppError("invalid_media", 400, "Those files can’t be posted together.");
    default:
      // The objects stay: the failure may be transient, the client cancels, and the sweep is the backstop.
      throw new Error(`Creating the post failed: ${error.code} ${error.message}`);
  }
}
