"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { AdminEvent } from "@/lib/api";
import { Field, Section } from "./Field";
import type { EventPatch } from "./useAdminEvent";
import { useQrUpload } from "./useQrUpload";

type Props = {
  event: AdminEvent;
  saving: boolean;
  save: (patch: EventPatch) => Promise<string | null>;
  onQrChanged: (event: AdminEvent) => void;
};

/** The DuitNow QR guests download, and the name and bank shown under it so they can check it. */
export function QrSection({ event, saving, save, onQrChanged }: Props) {
  const [holder, setHolder] = useState(event.qrAccountName);
  const [bank, setBank] = useState(event.qrBank);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // /qr is never cached; this makes the <img> reload
  const { upload, progress, error: uploadError } = useQrUpload((next) => {
    onQrChanged(next);
    setVersion((v) => v + 1);
  });
  const changed = holder.trim() !== event.qrAccountName || bank.trim() !== event.qrBank;

  return (
    <Section title="DuitNow QR">
      <div className="flex items-center gap-4">
        <div className="flex size-28 flex-none items-center justify-center overflow-hidden rounded-media bg-soft text-center text-xs text-muted">
          {event.hasQr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/qr?v=${version}`} alt="Current DuitNow QR" className="size-full object-contain" />
          ) : (
            "No QR yet"
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-soft px-5 text-sm font-semibold has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : event.hasQr ? "Replace QR" : "Upload QR"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={progress !== null}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // choosing the same file again must still fire
                if (file) void upload(file);
              }}
            />
          </label>
          <p className="text-xs text-muted">PNG or JPEG, up to 2 MB. A screenshot of the QR works best.</p>
        </div>
      </div>
      {uploadError && (
        <p role="alert" className="text-[13px] font-medium">
          {uploadError}
        </p>
      )}
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ qrAccountName: holder, qrBank: bank }).then(setError);
        }}
      >
        <Field
          label="Account holder name"
          value={holder}
          maxLength={80}
          onChange={(e) => setHolder(e.target.value)}
          hint="Shown under the QR so guests can check it before paying."
        />
        <Field label="Bank" value={bank} maxLength={60} onChange={(e) => setBank(e.target.value)} />
        {error && (
          <p role="alert" className="text-[13px] font-medium">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving || !changed}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </Section>
  );
}
