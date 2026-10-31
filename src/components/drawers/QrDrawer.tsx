"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "./BottomSheet";
import { useQrFile } from "./useQrFile";

export type QrInfo = { available: boolean; accountName: string | null; bank: string | null };

type Props = { open: boolean; qr: QrInfo; onClose: () => void };

/** The couple's DuitNow QR for a money gift. Not a post: nothing is stored about the gift. */
export function QrDrawer({ open, qr, onClose }: Props) {
  const file = useQrFile(open, qr.available);
  const [failed, setFailed] = useState(false);
  const holder = qr.accountName ?? "the couple";

  // A failed load is tried again each time the drawer opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFailed(false);
  }

  async function download() {
    // Phones with a share sheet offer "Save Image" there (iOS puts it in Photos).
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "DuitNow QR" });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the guest closed the sheet
      }
    }
    const link = document.createElement("a");
    link.href = file ? URL.createObjectURL(file) : "/qr";
    link.download = file?.name ?? "duitnow-qr";
    link.click();
    if (file) setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  }

  return (
    <BottomSheet open={open} title="DuitNow QR" onClose={onClose}>
      {qr.available ? (
        <>
          <p className="text-[13px] text-muted">Scan this QR in your banking app to send a gift to the couple.</p>
          <div className="mx-auto flex w-full max-w-[260px] flex-col items-center gap-2 rounded-card bg-card p-4 [border:var(--card-border)]">
            {failed ? (
              <p role="alert" className="py-10 text-center text-[13px] text-muted">
                The QR couldn’t be loaded. Please try again.
              </p>
            ) : (
              // Same-origin /qr: not cached, so a replaced QR shows at once.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/qr"
                alt={`DuitNow QR for ${holder}`}
                loading="lazy"
                onError={() => setFailed(true)}
                className="aspect-square w-full rounded-media object-contain"
              />
            )}
            {qr.accountName && <p className="text-sm font-semibold">{qr.accountName}</p>}
            {qr.bank && <p className="text-xs text-muted">{qr.bank}</p>}
          </div>
          <Button type="button" onClick={download}>
            Download QR
          </Button>
          <p className="text-center text-xs text-muted">Or long-press the QR and tap Save to Photos.</p>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
            <li>Save the QR to your phone.</li>
            <li>Open your banking app and choose DuitNow QR.</li>
            <li>
              Scan from gallery, pick the saved QR and check the name says <strong>{holder}</strong> before you pay.
            </li>
          </ol>
        </>
      ) : (
        <p className="py-6 text-center text-[13px] text-muted">The couple hasn’t added their DuitNow QR yet.</p>
      )}
    </BottomSheet>
  );
}
