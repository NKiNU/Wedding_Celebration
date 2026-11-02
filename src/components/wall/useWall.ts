"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type WallResponse } from "@/lib/api";
import { mergePosts, reconcileWall, type WallCounts, type WallPost } from "@/lib/domain/posts";
import { subscribeToWall, type SubscribeToWall } from "@/lib/realtime";

const REFRESH_DEBOUNCE_MS = 500;
/** Away longer than this, the socket may have dropped and a hide broadcast been missed. */
const STALE_AFTER_MS = 30_000;

type Initial = {
  eventId: string;
  posts: WallPost[];
  nextCursor: string | null;
  counts: WallCounts;
  wishes?: WallPost[];
};

/**
 * The wall's data: loaded posts, the next-page cursor, the pill counts and the newest wishes
 * (the ticker must not depend on which posts happen to be loaded). Pages arrive by
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
  const [wishes, setWishes] = useState(initial.wishes ?? []);
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
    const { posts: fresh, nextCursor: freshCursor, counts: freshCounts, wishes: freshWishes } = result.data;
    const folded = reconcileWall(postsRef.current, fresh, restart || freshCursor === null);
    setPosts(folded.posts);
    if (folded.restart) {
      epoch.current += 1;
      removed.current.clear();
      setNextCursor(freshCursor);
      setLoadError(null);
    }
    if (freshCounts) setCounts(freshCounts);
    if (freshWishes) setWishes(freshWishes);
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

  /** A post that was deleted or hidden: gone now, and a late page must not bring it back. */
  const drop = useCallback(
    (id: string) => {
      removed.current.add(id);
      setPosts((current) => current.filter((p) => p.id !== id));
      setWishes((current) => current.filter((p) => p.id !== id));
      scheduleRefresh(); // the pill counts and the ticker's next wish come from the server
    },
    [scheduleRefresh],
  );

  useEffect(() => {
    let connectedBefore = false;
    const stop = subscribe(initial.eventId, {
      onChange: () => scheduleRefresh(),
      onRemove: drop,
      onConnected: () => {
        // Even the first connection refetches: coming back from the viewer, the client router can
        // hand this page the payload it rendered minutes ago. A reconnect also restarts the list.
        scheduleRefresh(connectedBefore);
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
  }, [initial.eventId, subscribe, scheduleRefresh, drop]);

  return { posts, counts, wishes, nextCursor, loading, loadError, loadMore, refresh: refreshNow, drop };
}
