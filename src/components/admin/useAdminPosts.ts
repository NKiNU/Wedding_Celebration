"use client";

import { useState } from "react";
import { api, type AdminPost, type AdminPostsResponse } from "@/lib/api";

/** Every post (hidden ones too), with hide/unhide, pin/unpin and delete. Pages load on demand. */
export function useAdminPosts(initial: AdminPostsResponse) {
  const [posts, setPosts] = useState(initial.posts);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (loading || nextCursor === null) return;
    setLoading(true);
    setError(null);
    const result = await api<AdminPostsResponse>(`/api/admin/posts?cursor=${encodeURIComponent(nextCursor)}`, "GET");
    setLoading(false);
    if (!result.ok) return setError(result.error.message);
    setPosts((current) => [...current, ...result.data.posts.filter((p) => !current.some((c) => c.id === p.id))]);
    setNextCursor(result.data.nextCursor);
  }

  /** Reloads page 1 (posts shared since the admin page opened); later pages load again on demand. */
  async function refresh(): Promise<boolean> {
    if (loading) return false;
    setLoading(true);
    setError(null);
    const result = await api<AdminPostsResponse>("/api/admin/posts", "GET");
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setPosts(result.data.posts);
    setNextCursor(result.data.nextCursor);
    return true;
  }

  async function patch(post: AdminPost, body: { hidden: boolean } | { pinned: boolean }): Promise<string | null> {
    const result = await api(`/api/admin/posts/${post.id}`, "PATCH", body);
    if (!result.ok) return result.error.message;
    // The server unpins a post it hides.
    const change = "hidden" in body && body.hidden ? { hidden: true, pinned: false } : body;
    setPosts((current) => current.map((p) => (p.id === post.id ? { ...p, ...change } : p)));
    return null;
  }

  /** Returns an error message, or null when it worked. */
  const setHidden = (post: AdminPost, hidden: boolean) => patch(post, { hidden });
  /** Returns the server's message (e.g. the pin limit), or null when it worked. */
  const setPinned = (post: AdminPost, pinned: boolean) => patch(post, { pinned });

  /** A post that is already gone counts as deleted. */
  async function remove(post: AdminPost): Promise<string | null> {
    const result = await api(`/api/admin/posts/${post.id}`, "DELETE");
    if (!result.ok && result.error.code !== "post_not_found") return result.error.message;
    setPosts((current) => current.filter((p) => p.id !== post.id));
    return null;
  }

  return { posts, hasMore: nextCursor !== null, loading, error, loadMore, refresh, setHidden, setPinned, remove };
}
