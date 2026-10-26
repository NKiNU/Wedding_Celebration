import { cookies } from "next/headers";
import { updateEventBody } from "@/lib/validation";
import { requireAdmin, updateEvent } from "@/server/admin";
import { handle } from "@/server/http";

export const PATCH = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return updateEvent(updateEventBody.parse(await req.json().catch(() => null)));
  });
