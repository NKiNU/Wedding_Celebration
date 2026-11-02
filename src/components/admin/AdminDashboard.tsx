"use client";

import type { AdminEvent, AdminPostsResponse } from "@/lib/api";
import { AppearanceSection } from "./AppearanceSection";
import { DownloadAll } from "./DownloadAll";
import { EventForm } from "./EventForm";
import { ModerationList } from "./ModerationList";
import { QrSection } from "./QrSection";
import { UploadsSection } from "./UploadsSection";
import { useAdminEvent } from "./useAdminEvent";
import { useAdminLogin } from "./useAdminLogin";

type Props = { event: AdminEvent; initialPosts: AdminPostsResponse; now: string };

export function AdminDashboard({ event: initial, initialPosts, now }: Props) {
  const { event, setEvent, save, saving } = useAdminEvent(initial);
  const { logout } = useAdminLogin();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <button type="button" onClick={() => void logout()} className="h-11 rounded-full bg-soft px-5 text-sm font-semibold active:opacity-80">
          Log out
        </button>
      </header>
      <EventForm event={event} saving={saving} save={save} />
      <UploadsSection event={event} saving={saving} save={save} />
      <QrSection event={event} saving={saving} save={save} onQrChanged={setEvent} />
      <AppearanceSection event={event} saving={saving} save={save} onChanged={setEvent} />
      <ModerationList initial={initialPosts} now={now} />
      <DownloadAll />
    </main>
  );
}
