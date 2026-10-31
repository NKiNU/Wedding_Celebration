"use client";

import { useState } from "react";
import { api, type AdminEvent } from "@/lib/api";

export type EventPatch = Partial<{
  groomName: string;
  brideName: string;
  headerMessage: string;
  qrAccountName: string;
  qrBank: string;
  uploadsOpen: boolean;
}>;

/** The event as the admin sees it, and one `save` for every editable field. */
export function useAdminEvent(initial: AdminEvent) {
  const [event, setEvent] = useState(initial);
  const [saving, setSaving] = useState(false);

  /** Resolves to the server's message when it failed, or null when saved: each section shows its own. */
  async function save(patch: EventPatch): Promise<string | null> {
    setSaving(true);
    const result = await api<AdminEvent>("/api/admin/event", "PATCH", patch);
    setSaving(false);
    if (!result.ok) return result.error.message;
    setEvent(result.data);
    return null;
  }

  return { event, setEvent, save, saving };
}
