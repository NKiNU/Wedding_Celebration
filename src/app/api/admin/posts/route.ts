import { cookies } from "next/headers";
import { getModerationPage, requireAdmin } from "@/server/admin";
import { handle } from "@/server/http";

export const GET = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return getModerationPage(new URL(req.url).searchParams.get("cursor"));
  });
