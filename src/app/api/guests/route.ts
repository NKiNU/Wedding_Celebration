import { cookies } from "next/headers";
import { API_RATE_HOUR_MS, JOINS_PER_IP_PER_HOUR, JOINS_PER_IP_PER_WINDOW } from "@/lib/domain/limits";
import { createGuestBody } from "@/lib/validation";
import { handle } from "@/server/http";
import { createGuest } from "@/server/identity";
import { clientIp, rateLimit } from "@/server/rateLimit";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      const address = clientIp(req.headers);
      rateLimit("join", address, JOINS_PER_IP_PER_WINDOW);
      rateLimit("join-hour", address, JOINS_PER_IP_PER_HOUR, API_RATE_HOUR_MS);
      const { name } = createGuestBody.parse(await req.json().catch(() => null));
      return createGuest(name, await cookies());
    },
    201,
  );
