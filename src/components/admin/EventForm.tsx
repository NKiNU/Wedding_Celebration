"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AdminEvent } from "@/lib/api";
import { Field, Section } from "./Field";
import type { EventPatch } from "./useAdminEvent";

type Props = {
  event: AdminEvent;
  saving: boolean;
  save: (patch: EventPatch) => Promise<string | null>;
};

/** The couple's names and the line under them on the wall. */
export function EventForm({ event, saving, save }: Props) {
  const [groom, setGroom] = useState(event.groomName);
  const [bride, setBride] = useState(event.brideName);
  const [message, setMessage] = useState(event.headerMessage);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server trims, so compare trimmed: a saved name with a stray space is not a pending change.
  const changed =
    groom.trim() !== event.groomName || bride.trim() !== event.brideName || message.trim() !== event.headerMessage;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const problem = await save({ groomName: groom, brideName: bride, headerMessage: message });
    setError(problem);
    setSaved(problem === null);
  }

  return (
    <Section title="The couple">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Groom" value={groom} maxLength={40} onChange={(e) => setGroom(e.target.value)} />
          <Field label="Bride" value={bride} maxLength={40} onChange={(e) => setBride(e.target.value)} />
        </div>
        <Field
          label="Message under the names"
          value={message}
          maxLength={120}
          onChange={(e) => setMessage(e.target.value)}
          hint="Guests see it at the top of the wall."
        />
        {error && (
          <p role="alert" className="text-[13px] font-medium">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving || !changed || groom.trim() === "" || bride.trim() === ""}>
          {saving ? "Saving…" : saved && !changed ? "Saved" : "Save"}
        </Button>
      </form>
    </Section>
  );
}
