"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { WallPost } from "@/lib/domain/posts";

/**
 * "Delete this album?" for the viewer, the wish drawer and the Me drawer: `ask(post)` opens the
 * confirmation, `dialog` spreads onto <ConfirmDialog>, and `onDeleted` runs once the server agrees.
 * A post that is already gone (a second tap, a lost response) counts as deleted.
 */
export function useDeletePost(onDeleted: (post: WallPost) => void) {
  const [post, setPost] = useState<WallPost | null>(null); // kept after closing so the text does not change mid-fade
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = (target: WallPost) => {
    setPost(target);
    setError(null);
    setOpen(true);
  };

  const confirm = async () => {
    if (!post || pending) return;
    setPending(true);
    const result = await api(`/api/posts/${post.id}`, "DELETE");
    setPending(false);
    if (result.ok || result.error.code === "post_not_found") {
      setOpen(false);
      onDeleted(post);
    } else {
      setError(result.error.message);
    }
  };

  const dialog = {
    open,
    title: `Delete this ${post?.type ?? "post"}?`,
    body: "Guests will not see it anymore. This cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Keep it",
    pending,
    error,
    onConfirm: confirm,
    onCancel: () => setOpen(false),
  };
  return { ask, dialog };
}
