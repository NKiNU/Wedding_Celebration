"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminEvent } from "@/lib/api";
import { Section } from "./Field";
import { FontPicker } from "./FontPicker";
import type { EventPatch } from "./useAdminEvent";
import { useMonogramUpload } from "./useMonogramUpload";

type Props = {
  event: AdminEvent;
  saving: boolean;
  save: (patch: EventPatch) => Promise<string | null>;
  onChanged: (event: AdminEvent) => void;
};

/** The monogram image that replaces the text initials, and the fonts guests see. */
export function AppearanceSection({ event, saving, save, onChanged }: Props) {
  const [names, setNames] = useState(event.fonts.names);
  const [wishes, setWishes] = useState(event.fonts.wishes);
  const [body, setBody] = useState(event.fonts.body);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { upload, remove, progress, error: monogramError } = useMonogramUpload(onChanged);
  const changed = names !== event.fonts.names || wishes !== event.fonts.wishes || body !== event.fonts.body;

  return (
    <Section title="Appearance">
      <div className="flex items-center gap-4">
        <div className="flex size-28 flex-none items-center justify-center overflow-hidden rounded-media bg-soft text-center text-xs text-muted">
          {event.monogramUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.monogramUrl} alt="Current monogram" className="size-full object-contain" />
          ) : (
            "Text monogram"
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex h-11 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-soft px-5 text-sm font-semibold active:opacity-80 has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : event.monogramUrl ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/webp,image/svg+xml"
              disabled={progress !== null}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // choosing the same file again must still fire
                if (file) void upload(file);
              }}
            />
          </label>
          {event.monogramUrl && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-11 rounded-full bg-soft px-5 text-sm font-semibold active:opacity-80"
            >
              Remove (use text)
            </button>
          )}
          <p className="text-xs text-muted">
            Transparent PNG, WebP or SVG, up to 1 MB. For SVG, export as plain SVG with text converted to outlines (no DOCTYPE, no
            character codes like &amp;#169;).
          </p>
        </div>
      </div>
      {monogramError && (
        <p role="alert" className="text-[13px] font-medium">
          {monogramError}
        </p>
      )}
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ fontNames: names, fontWishes: wishes, fontBody: body }).then(setError);
        }}
      >
        <FontPicker label="Couple names" value={names} onChange={setNames} sampleText={`${event.groomName} & ${event.brideName}`} />
        <FontPicker label="Wishes" value={wishes} onChange={setWishes} sampleText="Congratulations and warmest wishes" />
        <FontPicker label="Everything else" value={body} onChange={setBody} sampleText="Share your memories with us" />
        {error && (
          <p role="alert" className="text-[13px] font-medium">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving || !changed}>
          {saving ? "Saving…" : "Save fonts"}
        </Button>
      </form>
      <ConfirmDialog
        open={confirming}
        title="Remove the monogram image?"
        body="Guests will see the text initials again. You can upload an image again at any time."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => {
          setConfirming(false);
          void remove();
        }}
        onCancel={() => setConfirming(false)}
      />
    </Section>
  );
}
