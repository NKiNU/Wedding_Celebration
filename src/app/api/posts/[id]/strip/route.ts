import { cookies } from "next/headers";
import { postIdParam } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { getOwnStripObject } from "@/server/posts";

/** Save: the owner's finished photo strip as a download. Errors come back in the usual JSON envelope. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let image: Uint8Array | undefined;
  const failed = await handle(req, async () => {
    const guest = await requireGuest(await cookies());
    image = await getOwnStripObject(guest, postIdParam.parse((await params).id));
    return null;
  });
  if (!image) return failed;
  return new Response(image as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": 'attachment; filename="photo-strip.jpg"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
