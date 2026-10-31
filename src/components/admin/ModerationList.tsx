"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Thumb } from "@/components/ui/Thumb";
import { Toast } from "@/components/ui/Toast";
import type { AdminPost, AdminPostsResponse } from "@/lib/api";
import { coverOf, postLabel, relativeTime } from "@/lib/domain/posts";
import { Section } from "./Field";
import { useAdminPosts } from "./useAdminPosts";

const ACTION = "h-11 rounded-full px-4 text-sm font-semibold active:opacity-80 disabled:opacity-50";

/** Every post, hidden ones too. Hide keeps the post (and its files); Delete removes both. */
export function ModerationList({ initial, now }: { initial: AdminPostsResponse; now: string }) {
  const { posts, hasMore, loading, error, loadMore, setHidden, remove } = useAdminPosts(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminPost | null>(null); // kept after closing so the text holds still while it fades
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const time = new Date(now);

  async function toggle(post: AdminPost) {
    setBusy(post.id);
    const problem = await setHidden(post, !post.hidden);
    setBusy(null);
    setToast(problem ?? (post.hidden ? "Post is visible again" : "Post hidden from guests"));
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
      {posts.length === 0 && <p className="text-sm text-muted">Nothing has been shared yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-col gap-2.5 border-t border-line pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative size-14 flex-none overflow-hidden rounded-media bg-soft">
                {post.type === "wish" ? (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-serif text-3xl">
                    “
                  </span>
                ) : (
                  <Thumb src={coverOf(post)} />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {postLabel(post)} · {post.author}
                  {post.hidden && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-[11px]">Hidden</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {relativeTime(post.createdAt, time)}
                  {(post.wishText ?? post.caption) && ` · ${post.wishText ?? post.caption}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className={`${ACTION} bg-soft`} disabled={busy === post.id} onClick={() => void toggle(post)}>
                {post.hidden ? "Unhide" : "Hide"}
              </button>
              <button
                type="button"
                className={`${ACTION} border border-ink`}
                onClick={() => {
                  setTarget(post);
                  setConfirmError(null);
                  setConfirming(true);
                }}
              >
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
