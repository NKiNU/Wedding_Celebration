import { cookies } from "next/headers";
import type { WallResponse } from "@/lib/api";
import { createPostBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { createMediaPost, createWish } from "@/server/posts";
import { getLatestWishes, getPinnedPosts, getWallCounts, getWallPage } from "@/server/wall";

/**
 * One page of the wall. The first page (no cursor) also carries the filter-pill counts, the ticker's wishes and the pins.
 * `req.url` is read outside `handle`: during the build, Next aborts a prerender by throwing
 * from the first request access, and `handle` would catch that and log it as an API error.
 */
export const GET = (req: Request) => {
  const cursor = new URL(req.url).searchParams.get("cursor");
  return handle(req, async (): Promise<WallResponse> => {
    const [page, counts, wishes, pinned] = await Promise.all([
      getWallPage(cursor),
      cursor ? null : getWallCounts(),
      cursor ? null : getLatestWishes(),
      cursor ? null : getPinnedPosts(),
    ]);
    return { ...page, counts, wishes, pinned };
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
