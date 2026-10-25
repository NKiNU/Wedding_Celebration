import { TrashIcon } from "@/components/ui/TrashIcon";
import { relativeTime, type WallPost } from "@/lib/domain/posts";
import { BottomSheet } from "./BottomSheet";

type Props = {
  wish: WallPost | null;
  now: Date;
  /** The viewer wrote it: they can take it down. */
  mine: boolean;
  onDelete: (wish: WallPost) => void;
  onClose: () => void;
};

/** A wish in full, with "Delete my wish" for its author. */
export function WishViewDrawer({ wish, now, mine, onDelete, onClose }: Props) {
  return (
    <BottomSheet open={wish !== null} title="Wish" onClose={onClose}>
      {wish && (
        <>
          <span aria-hidden="true" className="mt-2.5 block h-[30px] font-serif text-[64px] leading-[0.6]">
            “
          </span>
          <p className="font-serif text-2xl leading-[1.35] whitespace-pre-line italic">{wish.wishText}</p>
          <p className="text-[13px] text-muted">
            — {wish.author} · {relativeTime(wish.createdAt, now)}
          </p>
          {mine && (
            <button
              type="button"
              onClick={() => onDelete(wish)}
              className="mt-1.5 flex h-12 items-center justify-center gap-2 rounded-3xl border border-ink text-sm font-semibold transition-transform duration-100 active:scale-[0.98]"
            >
              <TrashIcon size={18} />
              Delete my wish
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}
