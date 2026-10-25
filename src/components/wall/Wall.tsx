"use client";

import { useEffect, useRef, useState } from "react";
import { WishViewDrawer } from "@/components/drawers/WishViewDrawer";
import { Toast } from "@/components/ui/Toast";
import type { KnownGuest } from "@/lib/api";
import { matchesFilter, type WallCounts, type WallFilter, type WallPost } from "@/lib/domain/posts";
import { consumeWelcome } from "@/lib/welcome";
import { EmptyState } from "./EmptyState";
import { FilterBar } from "./FilterBar";
import { PostCard } from "./PostCard";
import { useWall } from "./useWall";
import { WallHeader } from "./WallHeader";
import { WishTicker } from "./WishTicker";

const CLOCK_TICK_MS = 60_000;
const LOAD_AHEAD = "400px"; // start the next page this far before the sentinel scrolls into view

type Props = {
  eventId: string;
  groom: string;
  bride: string;
  headerMessage: string | null;
  me: KnownGuest;
  /** Server time, so the first render matches the HTML ("5 min ago" cannot differ). */
  now: string;
  initial: { posts: WallPost[]; nextCursor: string | null; counts: WallCounts };
};

export function Wall({ eventId, groom, bride, headerMessage, me, now: serverNow, initial }: Props) {
  const { posts, counts, nextCursor, loading, loadError, loadMore } = useWall({ eventId, ...initial });
  const [filter, setFilter] = useState<WallFilter>("all");
  const [wish, setWish] = useState<WallPost | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date(serverNow));

  // Follow the server's clock, not the phone's: a phone a few minutes off would otherwise make
  // "5 min ago" jump after the first tick. The offset is measured once, at hydration.
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [serverNow]);

  // Greet once after joining. Read in a timer callback: storage is not available during render.
  useEffect(() => {
    const timer = setTimeout(() => consumeWelcome() && setToast(`Welcome, ${me.name}!`), 0);
    return () => clearTimeout(timer);
  }, [me.name]);

  // Infinite scroll. The effect re-runs per cursor, so a sentinel that is still on screen after
  // a page loads (few posts match the filter) is observed, and therefore fires, again.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || nextCursor === null) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: LOAD_AHEAD,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  const visible = posts.filter((p) => matchesFilter(p, filter));
  const showEmpty = visible.length === 0 && (counts[filter] === 0 || nextCursor === null);

  return (
    <>
      <WallHeader groom={groom} bride={bride} headerMessage={headerMessage} memories={counts.all} me={me.name}>
        <WishTicker wishes={posts.filter((p) => p.type === "wish")} onOpen={setWish} />
      </WallHeader>
      <FilterBar counts={counts} value={filter} onChange={setFilter} />
      <main className="min-h-[620px] px-3 pt-3.5 pb-[120px] [background:var(--feed-pattern),var(--feed)]">
        <h2 className="sr-only">Memories</h2>
        {visible.length > 0 && (
          <ul className="grid grid-cols-2 gap-3">
            {visible.map((post) => (
              <li key={post.id} className="min-w-0">
                <PostCard post={post} mine={post.guestId === me.guestId} now={now} onOpenWish={setWish} />
              </li>
            ))}
          </ul>
        )}
        {showEmpty && <EmptyState filter={filter} />}
        <div ref={sentinel} className="flex min-h-12 items-center justify-center text-[13px] text-muted">
          {loading && <p role="status">Loading more…</p>}
          {loadError && (
            <button type="button" onClick={loadMore} className="h-11 rounded-full bg-card px-5 font-medium text-ink">
              {loadError} Try again
            </button>
          )}
        </div>
      </main>
      <WishViewDrawer wish={wish} now={now} onClose={() => setWish(null)} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
