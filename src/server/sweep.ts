import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { AppError } from "./http";
import { storedFilesOf } from "./uploads";
import { r2 } from "./r2";

const BATCH = 100;

/** Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`. Compared in constant time. */
export function assertCronRequest(authorization: string | null): void {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  const expected = digest(`Bearer ${env().CRON_SECRET}`);
  if (authorization === null || !timingSafeEqual(digest(authorization), expected)) {
    throw new AppError("unauthorized", 401, "Not allowed.");
  }
}

/**
 * Deletes the objects and rows of upload intents that never became a post. By the time an intent
 * has expired its presigned URLs (15 min of a 60 min TTL) are dead, so nothing can re-create what
 * is removed here: this is what finally reclaims abandoned and cancelled uploads.
 */
export async function sweepUploads(now = new Date()): Promise<{ removed: number; failed: number }> {
  const { data, error } = await db()
    .from("upload_intents")
    .select("post_id, files")
    .is("consumed_at", null)
    .lt("expires_at", now.toISOString())
    .limit(BATCH);
  if (error) throw new Error(`Loading expired uploads failed: ${error.code} ${error.message}`);

  const results = await Promise.allSettled(
    (data ?? []).map(async (row) => {
      await r2().deleteMany(storedFilesOf(row.files).map((f) => f.key));
      const { error: gone } = await db().from("upload_intents").delete().eq("post_id", row.post_id);
      if (gone) throw new Error(`${gone.code} ${gone.message}`);
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("Sweeping an upload failed", (r as PromiseRejectedResult).reason));
  return { removed: results.length - failed.length, failed: failed.length };
}
