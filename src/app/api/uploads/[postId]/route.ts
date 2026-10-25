import { cookies } from "next/headers";
import { postIdParam } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { cancelUploadIntent } from "@/server/uploads";

export const DELETE = (req: Request, { params }: { params: Promise<{ postId: string }> }) =>
  handle(req, async () => {
    const guest = await requireGuest(await cookies());
    await cancelUploadIntent(guest, postIdParam.parse((await params).postId));
    return null;
  });
