"use client";

import { useRouter } from "next/navigation";
import { useDeletePost } from "@/components/drawers/useDeletePost";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { flash } from "@/lib/flash";
import { cameFromWall } from "@/lib/fromWall";
import { postLabel, relativeTime, type WallPost } from "@/lib/domain/posts";
import { AlbumGallery } from "./AlbumGallery";
import { StripShare } from "./StripShare";
import { VideoPlayer } from "./VideoPlayer";

const WALL = "/wall";
const ROUND = "flex size-11 flex-none items-center justify-center rounded-full";

type Props = {
  post: WallPost;
  /** The viewer wrote it: they can delete it. */
  mine: boolean;
  /** Server time, so the first render matches the HTML ("5 min ago" cannot differ). */
  now: string;
};

/** Full-screen, dark: back, author and age, delete (author only), then the photo, album or video and its caption. */
export function PostViewer({ post, mine, now }: Props) {
  const router = useRouter();
  const remove = useDeletePost(() => {
    flash("Post deleted"); // the wall shows it: this screen is about to go
    // A full load: the client router would hand back the wall as it was before this post went.
    window.location.replace(WALL);
  });
  // Only a card tap proves the wall is the page behind this one. A link from another app has that app
  // behind it, so "back" goes to the wall instead (which reloads from its first page).
  const back = () => (cameFromWall(post.id) && window.history.length > 1 ? router.back() : router.replace(WALL));
  const video = post.type === "video" ? post.media[0] : undefined;
  const strip = post.type === "strip";

  return (
    <main className="flex h-dvh flex-col overscroll-contain bg-viewer pt-[env(safe-area-inset-top)] pb-[max(1.75rem,env(safe-area-inset-bottom))] text-overlay-ink">
      <header className="flex min-h-[60px] items-center gap-1 py-2 pr-2 pl-1">
        <button type="button" onClick={back} aria-label="Back to memories" className={ROUND}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="bone self-start truncate text-[15px] leading-tight font-semibold">{post.author}</h1>
          <p className="text-xs text-overlay-ink/70">
            <span className="bone">
              {relativeTime(post.createdAt, new Date(now))} · {postLabel(post)}
            </span>
          </p>
        </div>
        {mine && strip && <StripShare postId={post.id} />}
        {mine && (
          <button type="button" onClick={() => remove.ask(post)} aria-label="Delete this post" className={`${ROUND} bg-overlay-ink/12`}>
            <TrashIcon />
          </button>
        )}
      </header>
      {video ? (
        <VideoPlayer media={video} label={`Video by ${post.author}`} />
      ) : strip ? (
        // Only the finished 1080 x 1920 image, contained: no gallery chrome.
        <AlbumGallery media={post.media.slice(0, 1)} label="Photo strip: 3 photos in the wedding template" />
      ) : (
        <AlbumGallery media={post.media} />
      )}
      {post.caption && <p className="px-5 pt-2.5 text-[15px]">
          <span className="bone">{post.caption}</span>
        </p>}
      {mine && strip && (
        <p className="px-5 pt-1.5 text-xs text-overlay-ink/70">Long-press the image and tap Save to Photos.</p>
      )}
      <ConfirmDialog {...remove.dialog} />
    </main>
  );
}
