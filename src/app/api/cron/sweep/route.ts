import { handle } from "@/server/http";
import { assertCronRequest, purgeAdminAttempts, purgeRateAttempts, sweepUploads } from "@/server/sweep";

/** Hourly (a system cron on the VPS, docs/DEPLOY.md): reclaims the objects of uploads that never became a post. */
export const GET = (req: Request) => {
  const authorization = req.headers.get("authorization"); // read outside `handle`, like GET /api/posts
  return handle(req, async () => {
    assertCronRequest(authorization);
    const swept = await sweepUploads();
    await purgeAdminAttempts();
    await purgeRateAttempts();
    return swept;
  });
};
