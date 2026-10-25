import { relativeTime, type WallPost } from "@/lib/domain/posts";
import { BottomSheet } from "./BottomSheet";

type Props = { wish: WallPost | null; now: Date; onClose: () => void };

/** A wish in full. Phase 4 adds "Delete my wish" for its author. */
export function WishViewDrawer({ wish, now, onClose }: Props) {
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
        </>
      )}
    </BottomSheet>
  );
}
