import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wall } from "@/components/wall/Wall";
import { getEvent } from "@/server/event";
import { getSession } from "@/server/identity";
import { getWallCounts, getWallPage } from "@/server/wall";

export default function WallPage() {
  return (
    <Suspense>
      <WallContent />
    </Suspense>
  );
}

async function WallContent() {
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
    />
  );
}
