import { connection } from "next/server";
import { getStripTemplateObject } from "@/server/strip";

/**
 * The admin's photo-strip template on the app's own origin: a canvas can only export pixels it may read.
 * The page asks for `?v=<R2 key>`, so a new template has a new URL and this one can be cached for good.
 */
export async function GET() {
  await connection(); // read per request, never at build time
  const t = await getStripTemplateObject();
  if (!t) {
    // Relative Location: stays on whatever host the reverse proxy served.
    return new Response(null, {
      status: 307,
      headers: { location: "/strip/default-template.png", "cache-control": "no-store" },
    });
  }
  return new Response(t.body, {
    headers: {
      "content-type": t.mime,
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
