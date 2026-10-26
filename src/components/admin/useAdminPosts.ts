"use client";

import { useState } from "react";
import { api, type AdminPost, type AdminPostsResponse } from "@/lib/api";

/** Every post (hidden ones too), with hide/unhide and delete. Pages load on demand. */
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

  /** Returns an error message, or null when it worked. */
  async function setHidden(post: AdminPost, hidden: boolean): Promise<string | null> {
    const result = await api(`/api/admin/posts/${post.id}`, "PATCH", { hidden });
    if (!result.ok) return result.error.message;
    setPosts((current) => current.map((p) => (p.id === post.id ? { ...p, hidden } : p)));
    return null;
  }

  /** A post that is already gone counts as deleted. */
  async function remove(post: AdminPost): Promise<string | null> {
    const result = await api(`/api/admin/posts/${post.id}`, "DELETE");
    if (!result.ok && result.error.code !== "post_not_found") return result.error.message;
    setPosts((current) => current.filter((p) => p.id !== post.id));
    return null;
  }

  return { posts, hasMore: nextCursor !== null, loading, error, loadMore, setHidden, remove };
}
