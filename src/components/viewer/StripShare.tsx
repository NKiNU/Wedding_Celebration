"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/drawers/BottomSheet";
import { Button } from "@/components/ui/Button";

const FILENAME = "photo-strip.jpg";

/**
 * Owner-only Share for a photo strip: a sheet with "Share" (the phone's share sheet: WhatsApp, Facebook, …) and "Save to
 * phone". The 1080 x 1920 image comes from the owner route and is fetched up front, because iOS drops the
 * tap's permission to share across a `fetch` (same as the QR drawer).
 */
export function StripShare({ postId }: { postId: string }) {
  const href = `/api/posts/${postId}/strip`;
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const sharing = useRef(false);
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });

  useEffect(() => {
    let stale = false;
    fetch(href)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!stale && blob) setFile(new File([blob], FILENAME, { type: "image/jpeg" }));
      })
      .catch(() => {}); // Save still works through the route
    return () => {
      stale = true;
    };
  }, [href]);

  function save() {
    // The route answers with Content-Disposition: attachment, so the link downloads even before the prefetch is done.
    const link = document.createElement("a");
    link.href = file ? URL.createObjectURL(file) : href;
    link.download = FILENAME;
    link.click();
    if (file) setTimeout(() => URL.revokeObjectURL(link.href), 60_000); // iOS asks "Download?" before it reads the blob
    setOpen(false);
  }

  async function share() {
    if (sharing.current) return; // a second share() while the sheet is up rejects with InvalidStateError
    sharing.current = true;
    try {
      await navigator.share({ files: [file!], title: "Photo strip" });
      setOpen(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // the guest closed the share sheet
      save(); // the share sheet refused: the guest still gets the image
    } finally {
      sharing.current = false;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share photo strip"
        className="flex h-11 flex-none items-center gap-1.5 rounded-full bg-ink pr-3.5 pl-3 text-sm font-semibold text-paper transition-transform duration-100 select-none active:scale-[0.97]"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6" />
        </svg>
        Share
      </button>
      <BottomSheet open={open} title="Share photo strip" hideTitle onClose={() => setOpen(false)}>
        {canShare && (
          <Button type="button" onClick={share}>
            Share
          </Button>
        )}
        <button type="button" onClick={save} className="h-12 rounded-3xl bg-soft text-sm font-semibold text-ink transition-transform duration-100 select-none active:scale-[0.98]">
          Save to phone
        </button>
      </BottomSheet>
    </>
  );
}
