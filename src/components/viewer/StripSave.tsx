"use client";

import { useEffect, useState } from "react";

const FILENAME = "photo-strip.jpg";

/**
 * Owner-only Save for a photo strip: the 1080 x 1920 image from the owner route. The file is fetched
 * up front because iOS drops the tap's permission to share across a `fetch` (same as the QR drawer).
 * Phones that can share files get the share sheet ("Save Image" puts it in Photos); others download.
 */
export function StripSave({ postId }: { postId: string }) {
  const href = `/api/posts/${postId}/strip`;
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let stale = false;
    fetch(href)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!stale && blob) setFile(new File([blob], FILENAME, { type: "image/jpeg" }));
      })
      .catch(() => {}); // the download link still works
    return () => {
      stale = true;
    };
  }, [href]);

  async function save() {
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Photo strip" });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the guest closed the sheet
      }
    }
    // The route answers with Content-Disposition: attachment, so the link downloads even before the prefetch is done.
    const link = document.createElement("a");
    link.href = file ? URL.createObjectURL(file) : href;
    link.download = FILENAME;
    link.click();
    if (file) setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  }

  return (
    <button
      type="button"
      onClick={save}
      aria-label="Save image, story size 1080 by 1920"
      className="flex h-11 flex-none items-center gap-1.5 rounded-full bg-ink pr-3.5 pl-3 text-sm font-semibold text-paper transition-transform duration-100 select-none active:scale-[0.97]"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
      </svg>
      Save
    </button>
  );
}
