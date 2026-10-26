import { cookies } from "next/headers";
import { adminLoginBody } from "@/lib/validation";
import { clientIp, login, logout } from "@/server/admin";
import { handle } from "@/server/http";

export const POST = (req: Request) =>
  handle(req, async () => {
    const { passcode } = adminLoginBody.parse(await req.json().catch(() => null));
    await login(passcode, clientIp(req.headers), await cookies());
    return null;
  });

export const DELETE = (req: Request) =>
  handle(req, async () => {
    logout(await cookies());
    return null;
  });
