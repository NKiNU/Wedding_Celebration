"use client";

import { useEffect, useRef } from "react";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { AlbumGallery } from "@/components/viewer/AlbumGallery";
import { VideoPlayer } from "@/components/viewer/VideoPlayer";
import type { AdminPost } from "@/lib/api";
import { MAX_PINS } from "@/lib/domain/limits";
import { postLabel, relativeTime } from "@/lib/domain/posts";

const TAG = "flex items-center gap-1 rounded-xl px-2.5 py-0.5 text-xs font-semibold";
const BAR = "flex h-12 items-center justify-center rounded-full font-semibold active:opacity-80 disabled:opacity-45";

export function PinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6l-1 7 4 4H6l4-4-1-7zM12 14v7" />
    </svg>
  );
}

type Props = {
  /** The post on show; null keeps the viewer closed. */
  post: AdminPost | null;
  time: Date;
  pinCount: number;
  busy: boolean;
  onClose: () => void;
  onPin: (post: AdminPost) => void;
  onHide: (post: AdminPost) => void;
  onDelete: (post: AdminPost) => void;
};

/**
 * A post full screen over /admin, hidden ones too (the guest viewer /p/[id] refuses those), with
 * Pin, Hide and Delete. A native modal <dialog>: focus trap, Escape, and focus back on the thumbnail.
 */
export function AdminViewer({ post, time, pinCount, busy, onClose, onPin, onHide, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = post !== null;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const video = post?.type === "video" ? post.media[0] : undefined;
  const hint = post?.hidden
    ? "Hidden from guests. Unhide it to pin it."
    : `${post?.pinned ? "Shows first on the wall" : "Pinned posts show first on the wall"} · ${pinCount} of ${MAX_PINS} pinned`;

  return (
    <dialog
      ref={dialog}
      aria-label={post ? `${postLabel(post)} by ${post.author}` : "Post"}
      // Escape: the parent owns `post`, so the dialog closes through state, not by itself.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Chrome ignores preventDefault on `cancel` without a fresh gesture.
      onClose={() => open && onClose()}
      className="m-0 h-dvh max-h-none w-full max-w-none overscroll-contain bg-viewer p-0 text-overlay-ink backdrop:bg-viewer"
    >
      {post && (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <header className="flex min-h-[60px] items-center gap-1.5 py-2 pr-3 pl-1">
            <button type="button" onClick={onClose} aria-label="Close viewer" className="flex size-11 flex-none items-center justify-center rounded-full">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 className="truncate text-[15px] leading-tight font-semibold">{post.author}</h2>
              <p className="truncate text-xs text-overlay-ink/70">
                {relativeTime(post.createdAt, time)} · {postLabel(post)}
              </p>
            </div>
            {post.pinned && (
              <span className={`${TAG} bg-overlay-ink text-viewer`}>
                <PinIcon size={11} />
                Pinned
              </span>
            )}
            {post.hidden && <span className={`${TAG} bg-overlay-ink/16`}>Hidden</span>}
          </header>
          {post.type === "wish" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-7 pt-10">
              <span aria-hidden="true" className="h-10 font-serif text-7xl leading-[0.6]">
                “
              </span>
              <p className="font-serif text-[28px] leading-snug italic">{post.wishText}</p>
            </div>
          ) : video ? (
            <VideoPlayer media={video} label={`Video by ${post.author}`} />
          ) : post.type === "strip" ? (
            // The finished 1080 x 1920 image, like the guest viewer.
            <AlbumGallery media={post.media.slice(0, 1)} label="Photo strip: 3 photos in the wedding template" fill />
          ) : (
            <AlbumGallery media={post.media} />
          )}
          {post.caption && <p className="px-5 pt-3.5 text-[15px]">{post.caption}</p>}
          <div className="mt-auto flex flex-col gap-2 border-t border-overlay-ink/12 px-4 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onPin(post)}
                disabled={busy || post.hidden}
                aria-describedby="admin-viewer-hint"
                className={`${BAR} flex-1 gap-2 text-[15px] ${post.pinned ? "bg-overlay-ink/14" : "bg-overlay-ink text-viewer"}`}
              >
                <PinIcon size={16} />
                {post.pinned ? "Unpin" : "Pin to top of wall"}
              </button>
              <button type="button" onClick={() => onHide(post)} disabled={busy} className={`${BAR} bg-overlay-ink/14 px-4.5 text-sm`}>
                {post.hidden ? "Unhide" : "Hide"}
              </button>
              <button type="button" onClick={() => onDelete(post)} aria-label="Delete this post" className={`${BAR} w-12 border border-overlay-ink/40`}>
                <TrashIcon />
              </button>
            </div>
            <p id="admin-viewer-hint" className="text-xs text-overlay-ink/70">
              {hint}
            </p>
          </div>
        </div>
      )}
    </dialog>
  );
}
