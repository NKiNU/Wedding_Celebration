import { cookies } from "next/headers";
import type { WallResponse } from "@/lib/api";
import { createPostBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { createMediaPost, createWish } from "@/server/posts";
import { getWallCounts, getWallPage } from "@/server/wall";

/**
 * One page of the wall. The first page (no cursor) also carries the filter-pill counts.
 * `req.url` is read outside `handle`: during the build, Next aborts a prerender by throwing
 * from the first request access, and `handle` would catch that and log it as an API error.
 */
export const GET = (req: Request) => {
  const cursor = new URL(req.url).searchParams.get("cursor");
  return handle(req, async (): Promise<WallResponse> => {
    const [page, counts] = await Promise.all([getWallPage(cursor), cursor ? null : getWallCounts()]);
    return { ...page, counts };
  });
};

/** A wish, or the media post an upload intent was issued for. The type is never read from the body. */
export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      const guest = await requireGuest(await cookies());
      const { postId, caption, wishText } = createPostBody.parse(await req.json().catch(() => null));
      return wishText === undefined ? createMediaPost(guest, postId!, caption) : createWish(guest, wishText);
    },
    201,
  );
