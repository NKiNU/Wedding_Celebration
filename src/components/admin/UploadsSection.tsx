"use client";

import { useState } from "react";
import type { AdminEvent } from "@/lib/api";
import { Section } from "./Field";
import type { EventPatch } from "./useAdminEvent";

type Props = {
  event: AdminEvent;
  saving: boolean;
  save: (patch: EventPatch) => Promise<string | null>;
};

/** Closing uploads keeps the wall and the QR, but guests can no longer post. */
export function UploadsSection({ event, saving, save }: Props) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Guest uploads">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">
          {event.uploadsOpen ? (
            "Guests can share photos, videos and wishes."
          ) : (
            <>
              Uploads are <strong>closed</strong>. Guests can still see the wall and the QR.
            </>
          )}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={event.uploadsOpen}
          aria-label="Guests can upload"
          disabled={saving}
          onClick={() => void save({ uploadsOpen: !event.uploadsOpen }).then(setError)}
          // The button is the 44 px target; the track inside it is what is drawn.
          className="flex h-11 w-16 flex-none items-center justify-center disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-8 w-14 rounded-full transition-colors ${event.uploadsOpen ? "bg-ink" : "bg-soft"}`}
          >
            <span
              className={`absolute top-1 left-1 size-6 rounded-full bg-card transition-transform ${event.uploadsOpen ? "translate-x-6" : ""}`}
            />
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      )}
    </Section>
  );
}
