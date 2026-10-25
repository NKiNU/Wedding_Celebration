"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MAX_PHOTOS } from "@/lib/domain/limits";
import type { PostType } from "@/lib/domain/posts";
import { MediaError, preparePhoto } from "@/lib/media";
import { BottomSheet } from "./BottomSheet";
import { CaptionField } from "./CaptionField";
import { UploadProgress } from "./UploadProgress";
import { useCreatePost, type MediaItem } from "./useCreatePost";

type Picked = { id: string; file: File; url: string };

type Props = { open: boolean; onClose: () => void; onPosted: (type: PostType) => void };

/** Resizes one photo at a time (phones run out of canvas memory otherwise), then uploads them together. */
async function prepareAll(files: readonly File[]): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  for (const [position, file] of files.entries()) {
    try {
      const { main, thumb, width, height } = await preparePhoto(file);
      items.push(
        { role: "main", position, blob: main, mime: "image/jpeg", width, height },
        { role: "thumb", position, blob: thumb, mime: "image/jpeg" },
      );
    } catch (e) {
      const reason = e instanceof MediaError ? e.message : "This photo can’t be read. Try another one.";
      throw new MediaError(`Photo ${position + 1}: ${reason}`);
    }
  }
  return items;
}

export function PhotoDrawer({ open, onClose, onPosted }: Props) {
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [caption, setCaption] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { status, progress, error, postMedia, reset } = useCreatePost();
  const busy = preparing || status !== "idle";
  const count = photos.length;

  // Object URLs hold the picked files in memory: release them when the drawer unmounts.
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  });
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const clear = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setCaption("");
    setNotice(null);
    reset();
  };
  const close = () => {
    clear();
    onClose();
  };

  function pick(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    const room = MAX_PHOTOS - count;
    setNotice(chosen.length > room ? `Up to ${MAX_PHOTOS} photos per post.` : null);
    // Built outside the updater: React may run an updater twice and the first URLs would leak.
    const added = chosen.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...added]);
  }

  function remove(id: string) {
    const gone = photos.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setPhotos((current) => current.filter((p) => p.id !== id));
    setNotice(null);
  }

  async function submit() {
    setNotice(null);
    setPreparing(true);
    let items: MediaItem[];
    try {
      items = await prepareAll(photos.map((p) => p.file));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      return;
    } finally {
      setPreparing(false);
    }
    const type: PostType = count > 1 ? "album" : "photo";
    if (await postMedia(items, caption)) {
      clear();
      onPosted(type);
    }
  }

  return (
    <BottomSheet open={open} title="Share photos" onClose={close} busy={busy}>
      <p className="text-[13px] text-muted">Pick one photo, or up to {MAX_PHOTOS}. Several photos post together as one album.</p>
      <label
        className={`relative flex flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-line bg-card px-4 py-[18px] text-center has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${count ? "min-h-24" : "min-h-[150px]"} ${busy || count >= MAX_PHOTOS ? "opacity-35" : ""}`}
      >
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="M21 15.5l-5-4.5-9.5 8" />
        </svg>
        <span className="text-sm font-semibold">{count ? "Add more photos" : "Choose photos"}</span>
        <span className="text-xs text-muted">From your gallery or camera · JPG, PNG, HEIC</span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy || count >= MAX_PHOTOS}
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = ""; // so the same photo can be picked again after removing it
          }}
          className="sr-only"
        />
      </label>

      {count > 0 && (
        <>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">
              {count} {count === 1 ? "photo" : "photos"} selected
            </span>
            <span className="text-muted">{count > 1 ? "Will post as an album" : "Add more to make an album"}</span>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo, i) => (
              <li key={photo.id} className="relative aspect-square overflow-hidden rounded-[10px] bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise */}
                <img src={photo.url} alt={`Photo ${i + 1}`} decoding="async" className="size-full object-cover" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(photo.id)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-0 right-0 flex size-11 items-start justify-end"
                >
                  <span aria-hidden="true" className="m-[5px] flex size-[26px] items-center justify-center rounded-full bg-overlay text-overlay-ink">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <CaptionField value={caption} onChange={setCaption} placeholder="What is happening here?" disabled={busy} />
      {(notice ?? error) && (
        <p role="alert" className="text-[13px] font-medium">
          {notice ?? error}
        </p>
      )}
      {status !== "idle" ? (
        <UploadProgress status={status} progress={progress} />
      ) : (
        <Button type="button" onClick={submit} disabled={count === 0 || busy}>
          {preparing ? "Preparing photos…" : count > 1 ? `Post album (${count})` : "Post photo"}
        </Button>
      )}
    </BottomSheet>
  );
}
