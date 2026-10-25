import "server-only";
import { cache } from "react";
import { db } from "./db";
import { env } from "./env";

/** The wedding this deployment serves (docs/adr/002). Deduplicated within one render. */
export const getEvent = cache(async () => {
  const slug = env().EVENT_SLUG;
  const { data, error } = await db()
    .from("events")
    .select("id, groom_name, bride_name, header_message")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`Event "${slug}" not found: ${error.message}`);
  return data;
});
