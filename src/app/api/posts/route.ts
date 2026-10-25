import type { WallResponse } from "@/lib/api";
import { handle } from "@/server/http";
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
