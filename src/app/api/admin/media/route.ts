import { cookies } from "next/headers";
import { mediaManifest, requireAdmin } from "@/server/admin";
import { handle } from "@/server/http";

export const GET = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return mediaManifest();
  });
