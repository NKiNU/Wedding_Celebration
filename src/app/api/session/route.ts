import { cookies } from "next/headers";
import { activateGuestBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { activateGuest, clearActive, getSession } from "@/server/identity";

export const GET = (req: Request) => handle(req, async () => getSession(await cookies()));

export const POST = (req: Request) =>
  handle(req, async () => {
    const { guestId } = activateGuestBody.parse(await req.json().catch(() => null));
    return activateGuest(guestId, await cookies());
  });

export const DELETE = (req: Request) =>
  handle(req, async () => {
    clearActive(await cookies());
    return null;
  });
