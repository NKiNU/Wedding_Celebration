import { ZodError } from "zod";
import type { ApiError } from "@/lib/api";

/** A failure the client should see: it carries the status, a stable code and a safe message. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: ApiError["details"],
  ) {
    super(message);
  }
}

const READ_ONLY = new Set(["GET", "HEAD"]);

/**
 * Route handlers get no CSRF protection from Next (only Server Actions do), and a cross-site
 * form post can carry valid JSON. Browsers label every request, so refuse anything that is not
 * from this origin; non-browser callers send neither header and pass.
 */
function isCrossSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  return origin !== null && origin !== new URL(req.url).origin;
}

const fail = (status: number, error: ApiError) => Response.json({ ok: false, error }, { status });

/** Runs a handler body and maps its result or failure to the `ApiResult` envelope. */
export async function handle<T>(req: Request, run: () => Promise<T>, status = 200): Promise<Response> {
  if (!READ_ONLY.has(req.method) && isCrossSite(req)) {
    return fail(403, { code: "forbidden", message: "Cross-site requests are not allowed." });
  }
  try {
    return Response.json({ ok: true, data: await run() }, { status });
  } catch (e) {
    if (e instanceof AppError) {
      const { code, message, details } = e;
      return fail(e.status, { code, message, ...(details && { details }) });
    }
    if (e instanceof ZodError) {
      return fail(400, { code: "invalid_input", message: e.issues[0]?.message ?? "Invalid input." });
    }
    console.error("Unhandled API error", e);
    return fail(500, { code: "internal", message: "Something went wrong. Please try again." });
  }
}
