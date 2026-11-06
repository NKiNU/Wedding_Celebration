"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Thumb } from "@/components/ui/Thumb";
import { Toast } from "@/components/ui/Toast";
import type { AdminPost, AdminPostsResponse } from "@/lib/api";
import { MAX_PINS } from "@/lib/domain/limits";
import { coverOf, postLabel, relativeTime } from "@/lib/domain/posts";
import { AdminViewer, PinIcon } from "./AdminViewer";
import { Section } from "./Field";
import { useAdminPosts } from "./useAdminPosts";

const ACTION = "h-11 rounded-full px-4 text-sm font-semibold active:opacity-80 disabled:opacity-50";

/** Every post, hidden ones too. Hide keeps the post (and its files); Delete removes both; Pin puts it first on the wall. */
export function ModerationList({ initial, now }: { initial: AdminPostsResponse; now: string }) {
  const { posts, hasMore, loading, error, loadMore, refresh, setHidden, setPinned, remove } = useAdminPosts(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminPost | null>(null); // kept after closing so the text holds still while it fades
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [time, setTime] = useState(() => new Date(now));
  const [viewing, setViewing] = useState<string | null>(null);
  // Read from the list so the viewer follows pin/hide, and closes by itself once the post is deleted.
  const viewed = posts.find((p) => p.id === viewing) ?? null;
  // shortcut: counts loaded pages only, so a pin further down reads low until it is loaded; the server enforces MAX_PINS.
  const pinCount = posts.filter((p) => p.pinned).length;

  async function reload() {
    if (await refresh()) setTime(new Date());
  }

  async function toggle(post: AdminPost) {
    setBusy(post.id);
    const problem = await setHidden(post, !post.hidden);
    setBusy(null);
    setToast(problem ?? (post.hidden ? "Post is visible again" : post.pinned ? "Post hidden and unpinned" : "Post hidden from guests"));
  }

  async function togglePin(post: AdminPost) {
    setBusy(post.id);
    const problem = await setPinned(post, !post.pinned);
    setBusy(null);
    setToast(problem ?? (post.pinned ? "Post unpinned" : "Pinned to the top of the wall"));
  }

  function askDelete(post: AdminPost) {
    setTarget(post);
    setConfirmError(null);
    setConfirming(true);
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    const problem = await remove(target);
    setDeleting(false);
    if (problem) return setConfirmError(problem);
    setConfirming(false);
    setToast("Post deleted");
  }

  return (
    <Section title="Posts">
      <p className="-mt-2 text-xs text-muted">
        {pinCount} of {MAX_PINS} pinned · tap a photo to view it
      </p>
      <button type="button" className={`${ACTION} self-start bg-soft`} disabled={loading} onClick={() => void reload()}>
        {loading ? "Loading…" : "Refresh"}
      </button>
      {posts.length === 0 && <p className="text-sm text-muted">Nothing has been shared yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-col gap-2.5 border-t border-line pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setViewing(post.id)}
                aria-label={`View ${post.type === "strip" ? "photo strip" : post.type} by ${post.author}`}
                className="relative size-14 flex-none overflow-hidden rounded-media bg-soft"
              >
                {post.type === "wish" ? (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-serif text-3xl">
                    “
                  </span>
                ) : (
                  <Thumb src={coverOf(post)} />
                )}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {postLabel(post)} · {post.author}
                  {post.pinned && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 align-middle text-[11px] text-paper">
                      <PinIcon size={10} />
                      Pinned
                    </span>
                  )}
                  {post.hidden && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-[11px]">Hidden</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {relativeTime(post.createdAt, time)}
                  {(post.wishText ?? post.caption) && ` · ${post.wishText ?? post.caption}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!post.hidden && (
                <button
                  type="button"
                  className={`${ACTION} flex items-center gap-1.5 ${post.pinned ? "bg-ink text-paper" : "bg-soft"}`}
                  disabled={busy === post.id}
                  onClick={() => void togglePin(post)}
                >
                  <PinIcon />
                  {post.pinned ? "Unpin" : "Pin"}
                </button>
              )}
              <button type="button" className={`${ACTION} bg-soft`} disabled={busy === post.id} onClick={() => void toggle(post)}>
                {post.hidden ? "Unhide" : "Hide"}
              </button>
              <button type="button" className={`${ACTION} border border-ink`} onClick={() => askDelete(post)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      )}
      {hasMore && (
        <button type="button" className={`${ACTION} self-center bg-soft`} disabled={loading} onClick={() => void loadMore()}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
      <AdminViewer
        post={viewed}
        time={time}
        pinCount={pinCount}
        busy={busy === viewed?.id}
        onClose={() => setViewing(null)}
        onPin={(p) => void togglePin(p)}
        onHide={(p) => void toggle(p)}
        onDelete={askDelete}
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete this ${target?.type ?? "post"}?`}
        body={`This removes it${target ? ` from ${target.author}` : ""} for good, including its files. To keep it, use Hide instead.`}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        pending={deleting}
        error={confirmError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(false)}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </Section>
  );
}
