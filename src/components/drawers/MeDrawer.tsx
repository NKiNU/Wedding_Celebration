"use client";

import Link from "next/link";
import { Thumb } from "@/components/ui/Thumb";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { coverOf, postLabel, relativeTime, type WallPost } from "@/lib/domain/posts";
import { initialOf } from "@/lib/domain/names";
import { BottomSheet } from "./BottomSheet";
import type { MyPostsStatus } from "./useMyPosts";
import { useSwitchName } from "./useSwitchName";

type Props = {
  open: boolean;
  me: string;
  posts: WallPost[];
  status: MyPostsStatus;
  now: Date;
  onRetry: () => void;
  onOpenWish: (wish: WallPost) => void;
  onDelete: (post: WallPost) => void;
  onShare: () => void;
  /** "Switch name" could not reach the server. */
  onSwitchFailed: (message: string) => void;
  onClose: () => void;
};

const ROW = "flex min-w-0 flex-1 items-center gap-3 text-left";

function PostRow({ post, now, onOpenWish, onDelete }: { post: WallPost; now: Date } & Pick<Props, "onOpenWish" | "onDelete">) {
  const label = [postLabel(post), post.caption].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="relative block size-[52px] flex-none overflow-hidden rounded-[10px]">
        {post.type === "wish" ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-(--wish-bg) font-serif text-[34px] text-(--wish-ink) [border:var(--wish-border)]"
          >
            “
          </span>
        ) : (
          <Thumb src={coverOf(post)} />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className="truncate text-xs text-muted">{relativeTime(post.createdAt, now)}</span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-1.5 rounded-2xl border border-line bg-card p-1.5">
      {post.type === "wish" ? (
        <button type="button" onClick={() => onOpenWish(post)} className={ROW}>
          {body}
        </button>
      ) : (
        <Link href={`/p/${post.id}`} prefetch={false} className={ROW}>
          {body}
        </Link>
      )}
      <button
        type="button"
        onClick={() => onDelete(post)}
        aria-label={`Delete ${post.type}`}
        className="flex size-11 flex-none items-center justify-center rounded-full bg-soft"
      >
        <TrashIcon size={18} />
      </button>
    </li>
  );
}

/** "You": the guest's name, their own posts with delete, and Switch name. */
export function MeDrawer({ open, me, posts, status, now, onRetry, onOpenWish, onDelete, onShare, onSwitchFailed, onClose }: Props) {
  const { switching, switchName } = useSwitchName(onSwitchFailed);

  const showing = open ? (
    <>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-full bg-ink text-lg font-semibold text-paper">
          {initialOf(me)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[17px] font-semibold">{me}</span>
          <span className="text-xs text-muted">Remembered on this phone · no password</span>
        </span>
      </div>
      <h3 className="mt-1.5 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
        Your posts{status === "ready" && ` (${posts.length})`}
      </h3>
      {posts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} now={now} onOpenWish={onOpenWish} onDelete={onDelete} />
          ))}
        </ul>
      )}
      {posts.length === 0 && status === "loading" && <p role="status" className="text-[13px] text-muted">Loading your posts…</p>}
      {status === "error" && (
        <button type="button" onClick={onRetry} className="h-11 rounded-full border border-line bg-card px-5 text-[13px] font-medium">
          Can’t {posts.length === 0 ? "load" : "refresh"} your posts. Try again
        </button>
      )}
      {posts.length === 0 && status === "ready" && (
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line p-5 text-center">
          <span className="text-[13px] text-muted">You have not shared anything yet.</span>
          <button type="button" onClick={onShare} className="h-11 rounded-full bg-ink px-[18px] text-sm font-semibold text-paper">
            Share something
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={switchName}
        disabled={switching}
        className="mt-1 h-12 rounded-3xl bg-soft text-sm font-semibold text-ink disabled:opacity-60"
      >
        {switching ? "Switching…" : "Switch name"}
      </button>
      <p className="text-xs text-muted">Switching keeps your posts. You can come back as {me} from this phone.</p>
    </>
  ) : null;

  return (
    <BottomSheet open={open} title="You" onClose={onClose}>
      {showing}
    </BottomSheet>
  );
}
