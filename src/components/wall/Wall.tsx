"use client";

import { useEffect, useRef, useState } from "react";
import { MeDrawer } from "@/components/drawers/MeDrawer";
import { PhotoDrawer } from "@/components/drawers/PhotoDrawer";
import { QrDrawer, type QrInfo } from "@/components/drawers/QrDrawer";
import { useDeletePost } from "@/components/drawers/useDeletePost";
import { useMyPosts } from "@/components/drawers/useMyPosts";
import { VideoDrawer } from "@/components/drawers/VideoDrawer";
import { WishDrawer } from "@/components/drawers/WishDrawer";
import { WishViewDrawer } from "@/components/drawers/WishViewDrawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Toast } from "@/components/ui/Toast";
import type { KnownGuest } from "@/lib/api";
import { matchesFilter, type PostType, type WallCounts, type WallFilter, type WallPost } from "@/lib/domain/posts";
import { consumeFlash } from "@/lib/flash";
import { consumeWelcome } from "@/lib/welcome";
import { ActionMenu, type MenuKind } from "./ActionMenu";
import { EmptyState } from "./EmptyState";
import { Fab } from "./Fab";
import { FilterBar } from "./FilterBar";
import { PostCard } from "./PostCard";
import { useWall } from "./useWall";
import { WallHeader } from "./WallHeader";
import { WishTicker } from "./WishTicker";

const CLOCK_TICK_MS = 60_000;
const LOAD_AHEAD = "400px"; // start the next page this far before the sentinel scrolls into view

/** What the guest reads after sharing; the exact count of an album is on the wall itself. */
const POSTED: Record<PostType, string> = {
  photo: "Shared! Your photo is on the wall.",
  album: "Shared! Your photos are on the wall as an album.",
  video: "Shared! Your video is on the wall.",
  wish: "Your wish has been sent to the couple.",
};

type Props = {
  eventId: string;
  groom: string;
  bride: string;
  headerMessage: string | null;
  monogramUrl?: string | null;
  me: KnownGuest;
  /** Server time, so the first render matches the HTML ("5 min ago" cannot differ). */
  now: string;
  initial: { posts: WallPost[]; nextCursor: string | null; counts: WallCounts; wishes?: WallPost[] };
  /** A wish named by a shared link: its drawer starts open. */
  openWish?: WallPost | null;
  /** The admin can close uploads: the wall then only shows the DuitNow QR to share. */
  uploadsOpen?: boolean;
  qr?: QrInfo;
};

const NO_QR: QrInfo = { available: false, accountName: null, bank: null };

export function Wall({ eventId, groom, bride, headerMessage, monogramUrl, me, now: serverNow, initial, openWish = null, uploadsOpen = true, qr = NO_QR }: Props) {
  const { posts, counts, wishes, nextCursor, loading, loadError, loadMore, refresh, drop } = useWall({ eventId, ...initial });
  const [filter, setFilter] = useState<WallFilter>("all");
  const [wish, setWish] = useState<WallPost | null>(openWish);
  const [sheet, setSheet] = useState<"menu" | "me" | MenuKind | null>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date(serverNow));
  const mine = useMyPosts(sheet === "me");
  const remove = useDeletePost((post) => {
    drop(post.id);
    mine.drop(post.id);
    setWish((current) => (current?.id === post.id ? null : current));
    setToast("Post deleted");
  });

  // Follow the server's clock, not the phone's: a phone a few minutes off would otherwise make
  // "5 min ago" jump after the first tick. The offset is measured once, at hydration.
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [serverNow]);

  // A message left by the screen we came from (the viewer after a delete), else greet once after
  // joining. Read in a timer callback: storage is not available during render.
  useEffect(() => {
    const timer = setTimeout(() => {
      const message = consumeFlash();
      if (message) setToast(message);
      else if (consumeWelcome()) setToast(`Welcome, ${me.name}! Tap + to share.`);
    }, 0);
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

  // Our own post is not waiting for Realtime: fetch page 1 now, and make sure it can be seen.
  const posted = (type: PostType) => {
    setSheet(null);
    setToast(POSTED[type]);
    if (!matchesFilter({ type }, filter)) setFilter("all");
    window.scrollTo({ top: 0 });
    void refresh();
  };
  const closeSheet = () => setSheet(null);
  const closeMenu = () => {
    setSheet(null);
    fab.current?.focus();
  };

  const visible = posts.filter((p) => matchesFilter(p, filter));
  const showEmpty = visible.length === 0 && (counts[filter] === 0 || nextCursor === null);

  return (
    <>
      <WallHeader groom={groom} bride={bride} headerMessage={headerMessage} memories={counts.all} me={me.name} monogramUrl={monogramUrl} onOpenMe={() => setSheet("me")}>
        <WishTicker wishes={wishes} onOpen={setWish} />
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
        {showEmpty && <EmptyState filter={filter} onAction={uploadsOpen ? setSheet : undefined} />}
        <div ref={sentinel} className="flex min-h-12 items-center justify-center text-[13px] text-muted">
          {loading && <p role="status">Loading more…</p>}
          {loadError && (
            <button type="button" onClick={loadMore} className="h-11 rounded-full bg-card px-5 font-medium text-ink">
              {loadError} Try again
            </button>
          )}
        </div>
      </main>
      <ActionMenu
        open={sheet === "menu"}
        onPick={setSheet}
        onClose={closeMenu}
        returnFocus={() => fab.current?.focus()}
        uploadsOpen={uploadsOpen}
      />
      <Fab ref={fab} open={sheet === "menu"} onToggle={() => setSheet((current) => (current === "menu" ? null : "menu"))} />
      <PhotoDrawer open={sheet === "photos"} onClose={closeSheet} onPosted={posted} />
      <VideoDrawer open={sheet === "video"} onClose={closeSheet} onPosted={posted} />
      <QrDrawer open={sheet === "qr"} qr={qr} onClose={closeSheet} />
      <WishDrawer open={sheet === "wish"} me={me.name} onClose={closeSheet} onPosted={() => posted("wish")} />
      {/* Before the sheets: it closes first, so focus returns to the sheet's button, not to nowhere. */}
      <ConfirmDialog {...remove.dialog} />
      <MeDrawer
        open={sheet === "me"}
        me={me.name}
        posts={mine.posts}
        status={mine.status}
        now={now}
        onRetry={mine.retry}
        onOpenWish={(post) => {
          setSheet(null);
          setWish(post);
        }}
        onDelete={remove.ask}
        onShare={() => setSheet("menu")}
        onSwitchFailed={setToast}
        onClose={closeSheet}
      />
      <WishViewDrawer
        wish={wish}
        now={now}
        mine={wish?.guestId === me.guestId}
        onDelete={remove.ask}
        onClose={() => setWish(null)}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
