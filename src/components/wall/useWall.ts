"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type WallResponse } from "@/lib/api";
import { mergePosts, reconcileWall, type WallCounts, type WallPost } from "@/lib/domain/posts";
import { subscribeToWall, type SubscribeToWall } from "@/lib/realtime";

const REFRESH_DEBOUNCE_MS = 500;
/** Away longer than this, the socket may have dropped and a hide broadcast been missed. */
const STALE_AFTER_MS = 30_000;

type Initial = { eventId: string; posts: WallPost[]; nextCursor: string | null; counts: WallCounts };

/**
 * The wall's data: loaded posts, the next-page cursor and the pill counts. Pages arrive by
 * cursor. Realtime events trigger one debounced refetch of page 1, folded in with
 * `reconcileWall` (it also drops posts hidden or deleted behind it). After a reconnect or a
 * long absence a missed `post_hidden` could be sitting on a deeper page, so that refetch
 * restarts the list from page 1 instead.
 * ponytail: a restart shortens the list; guests who had scrolled deep scroll down again.
 */
export function useWall(initial: Initial, subscribe: SubscribeToWall = subscribeToWall) {
  const [posts, setPosts] = useState(initial.posts);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [counts, setCounts] = useState(initial.counts);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const busy = useRef(false);
  const epoch = useRef(0); // bumped when the list restarts: older page responses are then stale
  const removed = useRef(new Set<string>()); // hidden or deleted here; a late page must not revive them
  const postsRef = useRef(initial.posts);
  useEffect(() => {
    postsRef.current = posts;
  });

  const loadMore = useCallback(async () => {
    if (busy.current || nextCursor === null) return;
    busy.current = true;
    setLoading(true);
    const started = epoch.current;
    const result = await api<WallResponse>(`/api/posts?cursor=${encodeURIComponent(nextCursor)}`, "GET");
    if (epoch.current !== started) {
      // The list restarted while this page was in flight; its cursor no longer fits.
    } else if (result.ok) {
      setPosts((current) => mergePosts(current, result.data.posts.filter((p) => !removed.current.has(p.id))));
      setNextCursor(result.data.nextCursor);
      setLoadError(null);
    } else {
      setLoadError(result.error.message);
    }
    busy.current = false;
    setLoading(false);
  }, [nextCursor]);

  const refresh = useCallback(async (restart: boolean) => {
    const result = await api<WallResponse>("/api/posts", "GET");
    if (!result.ok) return; // the next event or visit retries; the old wall stays usable
    const { posts: fresh, nextCursor: freshCursor, counts: freshCounts } = result.data;
    const folded = reconcileWall(postsRef.current, fresh, restart || freshCursor === null);
    setPosts(folded.posts);
    if (folded.restart) {
      epoch.current += 1;
      removed.current.clear();
      setNextCursor(freshCursor);
      setLoadError(null);
    }
    if (freshCounts) setCounts(freshCounts);
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRestart = useRef(false);
  const scheduleRefresh = useCallback(
    (restart = false) => {
      pendingRestart.current ||= restart;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        const wantRestart = pendingRestart.current;
        pendingRestart.current = false;
        void refresh(wantRestart);
      }, REFRESH_DEBOUNCE_MS);
    },
    [refresh],
  );

  /** Fetch page 1 now: the guest's own new post must not wait for Realtime or the debounce. */
  const refreshNow = useCallback(() => {
    clearTimeout(refreshTimer.current);
    return refresh(false);
  }, [refresh]);

  useEffect(() => {
    let connectedBefore = false;
    const stop = subscribe(initial.eventId, {
      onChange: () => scheduleRefresh(),
      onRemove: (id) => {
        removed.current.add(id);
        setPosts((current) => current.filter((p) => p.id !== id));
        scheduleRefresh(); // the pill counts come from the server
      },
      onConnected: () => {
        // The first connection only repeats what the server just rendered.
        if (connectedBefore) scheduleRefresh(true);
        connectedBefore = true;
      },
    });
    // iOS Safari drops the socket when the tab is backgrounded or the phone locks.
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt !== null) {
        scheduleRefresh(Date.now() - hiddenAt > STALE_AFTER_MS);
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(refreshTimer.current);
    };
  }, [initial.eventId, subscribe, scheduleRefresh]);

  return { posts, counts, nextCursor, loading, loadError, loadMore, refresh: refreshNow };
}
