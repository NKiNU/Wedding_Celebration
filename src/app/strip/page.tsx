import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StripEditor } from "@/components/strip/StripEditor";
import { formatEventDate, stripTemplateUrl, windowsOf } from "@/lib/domain/strip";
import { getEvent } from "@/server/event";
import { getSession } from "@/server/identity";

export const metadata: Metadata = { title: "Photo strip" };

export default function StripPage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-viewer" />}>
      <StripContent />
    </Suspense>
  );
}

async function StripContent() {
  const { active } = await getSession(await cookies());
  if (!active) redirect(`/?next=${encodeURIComponent("/strip")}`);
  const event = await getEvent();
  if (!event.uploads_open) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-viewer px-8 text-center text-ink">
        <p className="text-sm">Sharing is closed. Thank you for your memories!</p>
        <Link href="/wall" className="flex h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-paper">
          Back to the wall
        </Link>
      </main>
    );
  }
  const custom = event.strip_template_path !== null;
  return (
    <StripEditor
      templateUrl={stripTemplateUrl(event.strip_template_path)}
      windows={windowsOf(event.strip_windows)}
      text={custom ? null : { names: `${event.groom_name} & ${event.bride_name}`, date: formatEventDate(event.event_date) }}
    />
  );
}
