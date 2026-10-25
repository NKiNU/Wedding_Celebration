import { Thumb } from "@/components/ui/Thumb";
import { coverOf, type WallPost } from "@/lib/domain/posts";

const BACK = "absolute inset-2 block overflow-hidden rounded-media border-[3px] border-card [box-shadow:var(--stack-shadow)]";

/** The two photos fanned out behind an album's cover. */
export function AlbumStack({ post }: { post: WallPost }) {
  return (
    <>
      <span className={`${BACK} -rotate-[8deg]`}>
        <Thumb src={coverOf(post, 2) ?? coverOf(post, 1) ?? coverOf(post)} />
      </span>
      <span className={`${BACK} rotate-[6deg]`}>
        <Thumb src={coverOf(post, 1) ?? coverOf(post)} />
      </span>
    </>
  );
}
