import { connection } from "next/server";
import { getQrObject } from "@/server/admin";

/**
 * The DuitNow QR on the app's own origin: `<a download>` ignores other origins and sharing the
 * image as a file needs to fetch it. Not cached, so a replaced QR shows up at once.
 */
export async function GET() {
  await connection(); // read per request, never at build time
  const qr = await getQrObject();
  if (!qr) return new Response("No QR yet.", { status: 404 });
  return new Response(qr.body, {
    headers: {
      "content-type": qr.mime,
      "content-disposition": 'inline; filename="duitnow-qr"',
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
