import { cookies } from "next/headers";
import { createGuestBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { createGuest } from "@/server/identity";
import { throttle } from "@/server/rateLimit";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      const { name } = createGuestBody.parse(await req.json().catch(() => null));
      await throttle("guest_join", req.headers);
      return createGuest(name, await cookies());
    },
    201,
  );
