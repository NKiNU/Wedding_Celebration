import { handle } from "@/server/http";
import { assertCronRequest, purgeAdminAttempts, sweepUploads } from "@/server/sweep";

/** Hourly (a system cron line on the VPS, see docs/DEPLOY.md): reclaims the objects of uploads that never became a post. */
export const GET = (req: Request) => {
  const authorization = req.headers.get("authorization"); // read outside `handle`, like GET /api/posts
  return handle(req, async () => {
    assertCronRequest(authorization);
    const swept = await sweepUploads();
    await purgeAdminAttempts();
    return swept;
  });
};
