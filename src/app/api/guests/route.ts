import { cookies } from "next/headers";
import { createGuestBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { createGuest } from "@/server/identity";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      const { name } = createGuestBody.parse(await req.json().catch(() => null));
      return createGuest(name, await cookies());
    },
    201,
  );
