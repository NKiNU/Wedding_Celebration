import { cookies } from "next/headers";
import type { WallPost } from "@/lib/domain/posts";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { getMyPosts } from "@/server/wall";

/** The active guest's own posts: the author comes from the token, never from the request. */
export const GET = (req: Request) =>
  handle(req, async (): Promise<WallPost[]> => getMyPosts((await requireGuest(await cookies())).id));
