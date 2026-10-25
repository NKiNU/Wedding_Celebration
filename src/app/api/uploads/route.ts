import { cookies } from "next/headers";
import { createUploadBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { requireGuest } from "@/server/identity";
import { createUploadIntent } from "@/server/uploads";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      const guest = await requireGuest(await cookies());
      const { files } = createUploadBody.parse(await req.json().catch(() => null));
      return createUploadIntent(guest, files);
    },
    201,
  );
