import "server-only";
import { QR_FETCH_TIMEOUT_MS } from "@/lib/domain/limits";
import { env } from "./env";
import { getEvent } from "./event";

/** The admin's strip template from the media domain, or null when the event uses the default one. */
export async function getStripTemplateObject(): Promise<{ body: ReadableStream<Uint8Array>; mime: string } | null> {
  const { strip_template_path: path } = await getEvent();
  if (!path) return null;
  const res = await fetch(`${env().NEXT_PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "")}/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(QR_FETCH_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) return null;
  return { body: res.body, mime: path.endsWith(".png") ? "image/png" : "image/jpeg" };
}
