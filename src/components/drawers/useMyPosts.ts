"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { WallPost } from "@/lib/domain/posts";

export type MyPostsStatus = "loading" | "ready" | "error";

/**
 * The guest's own posts for the Me drawer. The wall only holds the pages scrolled so far, so this
 * asks the server each time the drawer opens; the last list stays on screen while it refreshes.
 */
export function useMyPosts(open: boolean) {
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [status, setStatus] = useState<MyPostsStatus>("loading");
  const latest = useRef(0); // a slow answer to an earlier open must not overwrite a newer one

  const load = useCallback(() => {
    const mine = ++latest.current;
    return api<WallPost[]>("/api/me/posts", "GET").then((result) => {
      if (mine !== latest.current) return;
      if (result.ok) {
        setPosts(result.data);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const retry = () => {
    setStatus("loading");
    void load();
  };
  const drop = useCallback((id: string) => setPosts((current) => current.filter((p) => p.id !== id)), []);

  return { posts, status, retry, drop };
}
