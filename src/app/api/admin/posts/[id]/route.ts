import { cookies } from "next/headers";
import { moderateBody, postIdParam } from "@/lib/validation";
import { requireAdmin, setHidden, setPinned } from "@/server/admin";
import { getEvent } from "@/server/event";
import { handle } from "@/server/http";
import { deletePostAsAdmin } from "@/server/posts";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (req: Request, { params }: Ctx) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    const body = moderateBody.parse(await req.json().catch(() => null));
    const id = postIdParam.parse((await params).id);
    await ("hidden" in body ? setHidden(id, body.hidden) : setPinned(id, body.pinned));
    return null;
  });

export const DELETE = (req: Request, { params }: Ctx) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    await deletePostAsAdmin((await getEvent()).id, postIdParam.parse((await params).id));
    return null;
  });
