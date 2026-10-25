import "server-only";
import { randomUUID } from "node:crypto";
import type { UploadIntent } from "@/lib/api";
import type { Json } from "@/lib/database.types";
import { INTENT_TTL_MS, RATE_WINDOW_MS } from "@/lib/domain/limits";
import { intentUsage, rateLimitProblem, type Usage } from "@/lib/domain/rateLimit";
import { mediaKey, totalBytes, type StoredFile, type UploadFile } from "@/lib/domain/uploads";
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
 * What this guest has used in the last hour. The intent TTL equals the window, so an intent that
 * has not expired was created inside it, whether or not it became a post; counting intents (not
 * posts) means uploads still in flight count and deleting a post does not free quota. Wishes have
 * no intent and are counted from `posts`.
 * ponytail: per guest, not per phone, and check-then-insert can overshoot by the requests in
 * flight. Phase 6 caps guests per event; a locked SQL function would close the race.
 */
export async function guestUsage(guestId: string, now = new Date()): Promise<Usage> {
  const [intents, wishes] = await Promise.all([
    db().from("upload_intents").select("files").eq("guest_id", guestId).gt("expires_at", now.toISOString()),
    db()
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId)
      .eq("type", "wish")
      .gte("created_at", new Date(now.getTime() - RATE_WINDOW_MS).toISOString()),
  ]);
  if (intents.error) throw new Error(`Loading upload usage failed: ${intents.error.code} ${intents.error.message}`);
  if (wishes.error) throw new Error(`Loading wish usage failed: ${wishes.error.code} ${wishes.error.message}`);
  const media = intentUsage((intents.data ?? []).map((row) => ({ files: storedFiles.parse(row.files) })));
  return { posts: media.posts + (wishes.count ?? 0), bytes: media.bytes };
}

export async function assertWithinRateLimit(guestId: string, adding: Usage): Promise<void> {
  const problem = rateLimitProblem(await guestUsage(guestId), adding);
  if (problem) throw new AppError("rate_limited", 429, problem);
}

/**
 * Reserves a post id and keys for these files and returns one presigned PUT URL per file. The
 * client never picks a key, and each URL accepts exactly the declared type and size.
 */
export async function createUploadIntent(guest: Guest, files: UploadFile[]): Promise<UploadIntent> {
  const event = await getEvent();
  assertUploadsOpen(event);
  await assertWithinRateLimit(guest.id, { posts: 1, bytes: totalBytes(files) });

  const postId = randomUUID();
  const stored: StoredFile[] = files.map((f) => ({ ...f, key: mediaKey(event.id, postId, f) }));
  const { error } = await db()
    .from("upload_intents")
    .insert({
      post_id: postId,
      event_id: event.id,
      guest_id: guest.id,
      files: stored as unknown as NonNullable<Json>,
      expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
    });
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
    // An intent nobody can use must not keep counting against the guest's hour.
    await db().from("upload_intents").delete().eq("post_id", postId);
    throw e;
  }
}

/** Removes the objects of an intent that will never become a post, then the intent itself. */
export async function discardIntent(postId: string, keys: readonly string[]): Promise<void> {
  await r2().deleteMany(keys);
  const { error } = await db().from("upload_intents").delete().eq("post_id", postId);
  if (error) throw new Error(`Deleting the upload intent failed: ${error.code} ${error.message}`);
}

/**
 * The client's cleanup after a failed upload. The intent is expired first (one atomic update
 * that only matches an unconsumed row), so a post that was committed after a lost response keeps
 * its files, and one still being committed fails with "expired" instead of pointing at deleted
 * objects. Objects go before the row, so if R2 fails the expired row is left for the hourly sweep.
 */
export async function cancelUploadIntent(guest: Guest, postId: string): Promise<void> {
  const { data, error } = await db()
    .from("upload_intents")
    .update({ expires_at: new Date().toISOString() })
    .eq("post_id", postId)
    .eq("guest_id", guest.id)
    .is("consumed_at", null)
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
    throw row
      ? new AppError("already_posted", 409, "That post is already on the wall.")
      : new AppError("intent_not_found", 404, "We couldn’t find that upload.");
  }
  await discardIntent(postId, storedFiles.parse(claimed.files).map((f) => f.key));
}
