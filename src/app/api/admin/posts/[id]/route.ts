import { cookies } from "next/headers";
import { hideBody, postIdParam } from "@/lib/validation";
import { requireAdmin, setHidden } from "@/server/admin";
import { getEvent } from "@/server/event";
import { handle } from "@/server/http";
import { deletePostAsAdmin } from "@/server/posts";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = (req: Request, { params }: Ctx) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    const { hidden } = hideBody.parse(await req.json().catch(() => null));
    await setHidden(postIdParam.parse((await params).id), hidden);
    return null;
  });

export const DELETE = (req: Request, { params }: Ctx) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    await deletePostAsAdmin((await getEvent()).id, postIdParam.parse((await params).id));
    return null;
  });
