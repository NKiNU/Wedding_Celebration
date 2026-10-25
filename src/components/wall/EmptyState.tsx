import type { WallFilter } from "@/lib/domain/posts";

const COPY: Record<WallFilter, { title: string; body: string }> = {
  all: { title: "No memories yet", body: "Be the first to share a moment from today." },
  photos: { title: "No photos yet", body: "Share a photo or a whole album from the ceremony." },
  videos: { title: "No videos yet", body: "Capture the kompang, the first dance, the laughs." },
  wishes: { title: "No wishes yet", body: "Leave a few warm words for the couple." },
};

export function EmptyState({ filter }: { filter: WallFilter }) {
  const { title, body } = COPY[filter];
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-card px-5 py-9 text-center [border:var(--card-border)]">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-[13px] text-muted">{body}</p>
    </div>
  );
}
