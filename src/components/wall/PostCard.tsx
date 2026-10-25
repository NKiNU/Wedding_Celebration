import Link from "next/link";
import { Thumb } from "@/components/ui/Thumb";
import { coverOf, formatDuration, relativeTime, type PostType, type WallPost } from "@/lib/domain/posts";
import { AlbumStack } from "./AlbumStack";

const LEAD: Record<PostType, string> = {
  photo: "Photo by",
  album: "Album by",
  video: "Video by",
  wish: "Wish from",
};

const CARD =
  "flex w-full flex-col gap-2 rounded-card bg-card p-2 text-left transition-transform duration-100 active:scale-[0.98] [border:var(--card-border)] [box-shadow:var(--card-shadow)]";
const BADGE = "absolute rounded-xl bg-overlay px-2 py-0.5 text-[11px] font-semibold text-overlay-ink";

function Face({ post }: { post: WallPost }) {
  if (post.type === "wish") {
    return (
      <span className="absolute inset-0 flex flex-col gap-0.5 rounded-media bg-(--wish-bg) px-3.5 py-3 text-(--wish-ink) [border:var(--wish-border)]">
        <span aria-hidden="true" className="h-6 font-serif text-[40px] leading-[0.9]">
          “
        </span>
        <span className="line-clamp-5 font-serif text-base leading-[1.3] italic">{post.wishText}</span>
      </span>
    );
  }
  const album = post.type === "album";
  return (
    <>
      {album && <AlbumStack post={post} />}
      <span
        className={`absolute block overflow-hidden rounded-media ${album ? "inset-2 border-[3px] border-card [box-shadow:var(--stack-shadow)]" : "inset-0"}`}
      >
        <Thumb src={coverOf(post)} />
      </span>
      {album && (
        <span className={`${BADGE} top-3.5 right-3.5 flex items-center gap-1`}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="7" width="13" height="13" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
          {post.media.length}
        </span>
      )}
      {post.type === "video" && (
        <>
          <span aria-hidden="true" className="absolute top-1/2 left-1/2 flex size-[46px] -translate-1/2 items-center justify-center rounded-full bg-overlay text-overlay-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          {post.media[0]?.durationS != null && (
            <span className={`${BADGE} right-2 bottom-2`}>{formatDuration(post.media[0].durationS)}</span>
          )}
        </>
      )}
    </>
  );
}

type Props = {
  post: WallPost;
  mine: boolean;
  now: Date;
  onOpenWish: (post: WallPost) => void;
};

/** One card on the wall: media or wish text, then author, age and a "You" badge. */
export function PostCard({ post, mine, now, onOpenWish }: Props) {
  const body = (
    <>
      <span className="relative block aspect-square w-full">
        <Face post={post} />
      </span>
      <span className="flex items-center justify-between gap-1.5 px-0.5 pb-0.5 leading-[1.1]">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">{post.author}</span>
          <time dateTime={post.createdAt} suppressHydrationWarning className="text-[11px] text-muted">
            {relativeTime(post.createdAt, now)}
          </time>
        </span>
        {mine && <span className="flex-none rounded-[10px] bg-soft px-2 py-[3px] text-[10px] font-semibold">You</span>}
      </span>
    </>
  );

  if (post.type === "wish") {
    return (
      <button type="button" onClick={() => onOpenWish(post)} className={CARD}>
        {body}
      </button>
    );
  }
  const label = `${LEAD[post.type]} ${post.author}${post.type === "album" ? `, ${post.media.length} photos` : ""}`;
  // The viewer page arrives in Phase 4; prefetch stays off so 24 cards do not each fetch it.
  return (
    <Link href={`/p/${post.id}`} prefetch={false} aria-label={label} className={CARD}>
      {body}
    </Link>
  );
}
