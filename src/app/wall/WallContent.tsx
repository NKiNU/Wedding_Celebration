import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wall } from "@/components/wall/Wall";
import type { WallPost } from "@/lib/domain/posts";
import { getEvent } from "@/server/event";
import { getSession } from "@/server/identity";
import { getWallCounts, getWallPage } from "@/server/wall";

/** The wall for the active guest. `openWish` starts that wish's drawer open (a shared wish link, see `/p/[id]`). */
export async function WallContent({ openWish = null }: { openWish?: WallPost | null }) {
  const { active } = await getSession(await cookies());
  if (!active) redirect("/");
  const [event, page, counts] = await Promise.all([getEvent(), getWallPage(null), getWallCounts()]);
  return (
    <Wall
      eventId={event.id}
      groom={event.groom_name}
      bride={event.bride_name}
      headerMessage={event.header_message}
      me={active}
      now={new Date().toISOString()}
      initial={{ ...page, counts }}
      openWish={openWish}
      uploadsOpen={event.uploads_open}
      qr={{ available: event.qr_path !== null, accountName: event.qr_account_name, bank: event.qr_bank }}
    />
  );
}
