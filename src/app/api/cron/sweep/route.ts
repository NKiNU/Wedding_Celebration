import { handle } from "@/server/http";
import { assertCronRequest, sweepUploads } from "@/server/sweep";

/** Hourly (Vercel Cron): reclaims the objects of uploads that never became a post. */
export const GET = (req: Request) => {
  const authorization = req.headers.get("authorization"); // read outside `handle`, like GET /api/posts
  return handle(req, async () => {
    assertCronRequest(authorization);
    return sweepUploads();
  });
};
