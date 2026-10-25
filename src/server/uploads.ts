import "server-only";
import { randomUUID } from "node:crypto";
import type { UploadIntent } from "@/lib/api";
import type { Json } from "@/lib/database.types";
import { BYTES_PER_HOUR, INTENT_TTL_MS, POSTS_PER_HOUR, RATE_WINDOW_MS } from "@/lib/domain/limits";
import { mediaKey, type StoredFile, type UploadFile } from "@/lib/domain/uploads";
import { storedFiles } from "@/lib/validation";
import { db } from "./db";
import { getEvent } from "./event";
import { AppError } from "./http";
import type { Guest } from "./identity";
import { r2 } from "./r2";

/** Every write path refuses while the admin has closed uploads. */
export function assertUploadsOpen(event: { uploads_open: boolean }): void {
  if (!event.uploads_open) {
    throw new AppError("uploads_closed", 403, "Sharing is closed for now. Thank you for being part of today!");
  }
}

/**
 * The hourly allowance, enforced by the database function that also spends it (migration 0002):
 * check and insert share one transaction under a per-guest lock, so parallel requests cannot all
 * see an empty allowance. Intents count while unexpired (TTL = window), posted or cancelled or
 * not, so uploads in flight count and neither a cancel nor a delete frees quota.
 * ponytail: per guest, not per phone; Phase 6 caps how many guests one phone can create.
 */
export const limitArgs = () => ({
  p_since: new Date(Date.now() - RATE_WINDOW_MS).toISOString(),
  p_max_posts: POSTS_PER_HOUR,
  p_max_bytes: BYTES_PER_HOUR,
});

export const rateLimited = () =>
  new AppError("rate_limited", 429, "You’ve shared a lot in the last hour. Please try again a little later.");

/** `files` of an intent row. A malformed row is our bug, so it is a 500, not a guest's 400. */
export function storedFilesOf(json: unknown): StoredFile[] {
  const parsed = storedFiles.safeParse(json);
  if (!parsed.success) throw new Error("Stored upload files are malformed");
  return parsed.data;
}

/**
 * Reserves a post id and keys for these files and returns one presigned PUT URL per file. The
 * client never picks a key, and each URL accepts exactly the declared type and size.
 */
export async function createUploadIntent(guest: Guest, files: UploadFile[]): Promise<UploadIntent> {
  const event = await getEvent();
  assertUploadsOpen(event);

  const postId = randomUUID();
  const stored: StoredFile[] = files.map((f) => ({ ...f, key: mediaKey(event.id, postId, f) }));
  const { error } = await db().rpc("create_upload_intent", {
    p_post_id: postId,
    p_event_id: event.id,
    p_guest_id: guest.id,
    p_files: stored as unknown as Json,
    p_expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
    ...limitArgs(),
  });
  if (error?.code === "PT429") throw rateLimited();
  if (error) throw new Error(`Creating the upload intent failed: ${error.code} ${error.message}`);

  const signer = r2();
  try {
    const uploads = await Promise.all(
      stored.map(async (f) => ({
        role: f.role,
        position: f.position,
        url: await signer.presignPut(f.key, f.mime, f.bytes),
      })),
    );
    return { postId, uploads };
  } catch (e) {
    // No URL was handed out, so an intent nobody can use must not keep counting against the guest.
    await db().from("upload_intents").delete().eq("post_id", postId);
    throw e;
  }
}

/**
 * The client's cleanup after a failed upload. The intent is marked cancelled by one atomic update
 * that only matches an unconsumed row, so a post committed after a lost response keeps its files
 * and one still being committed fails with "expired" instead of pointing at deleted objects.
 * The row stays as a tombstone: it keeps counting against the hour, and the sweep removes the
 * objects again once its presigned URLs are dead (a URL can re-create a deleted file).
 */
export async function cancelUploadIntent(guest: Guest, postId: string): Promise<void> {
  const { data, error } = await db()
    .from("upload_intents")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("post_id", postId)
    .eq("guest_id", guest.id)
    .is("consumed_at", null)
    .is("cancelled_at", null)
    .select("files");
  if (error) throw new Error(`Cancelling the upload failed: ${error.code} ${error.message}`);

  const claimed = data?.[0];
  if (!claimed) {
    const { data: row } = await db()
      .from("upload_intents")
      .select("consumed_at")
      .eq("post_id", postId)
      .eq("guest_id", guest.id)
      .maybeSingle();
    if (!row) throw new AppError("intent_not_found", 404, "We couldn’t find that upload.");
    if (row.consumed_at) throw new AppError("already_posted", 409, "That post is already on the wall.");
    return; // cancelled before: cancelling twice is fine
  }
  // Best effort: the sweep deletes them again whether or not this works.
  await r2()
    .deleteMany(storedFilesOf(claimed.files).map((f) => f.key))
    .catch((e) => console.error("Deleting cancelled upload objects failed", postId, e));
}
