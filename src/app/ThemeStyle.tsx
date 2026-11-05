import { connection } from "next/server";
import { themeCss } from "@/lib/domain/fonts";
import { getEvent } from "@/server/event";

/** The event's chosen fonts as CSS variables. Must render inside <Suspense> (reads the database).
 *  `data-font-choice` tells the font gate (lib/fontGate.ts) that the choice has arrived. */
export async function ThemeStyle() {
  await connection(); // read per request, never at build time (the build has no database)
  const e = await getEvent();
  return <style data-font-choice="">{themeCss({ names: e.font_names, wishes: e.font_wishes, body: e.font_body })}</style>;
}
