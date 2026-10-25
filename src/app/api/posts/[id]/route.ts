import { cookies } from "next/headers";
import { postIdParam } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { deletePost } from "@/server/posts";

export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(req, async () => {
    const guest = await requireGuest(await cookies());
    await deletePost(guest, postIdParam.parse((await params).id));
    return null;
  });
