import "server-only";
import { cache } from "react";
import { db } from "./db";
import { env } from "./env";

/** Every column the app reads from `events`. */
export const EVENT_COLUMNS =
  "id, groom_name, bride_name, header_message, uploads_open, qr_path, qr_account_name, qr_bank";

/** The wedding this deployment serves (docs/adr/002). Deduplicated within one render. */
export const getEvent = cache(async () => {
  const slug = env().EVENT_SLUG;
  const { data, error } = await db()
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`Event "${slug}" not found: ${error.message}`);
  return data;
});
