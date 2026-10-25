import type { WallFilter } from "@/lib/domain/posts";

type Action = "menu" | "photos" | "video" | "wish";

const COPY: Record<WallFilter, { title: string; body: string; cta: string; action: Action }> = {
  all: { title: "No memories yet", body: "Be the first to share a moment from today.", cta: "Share a memory", action: "menu" },
  photos: { title: "No photos yet", body: "Share a photo or a whole album from the ceremony.", cta: "Add photos", action: "photos" },
  videos: { title: "No videos yet", body: "Capture the kompang, the first dance, the laughs.", cta: "Add a video", action: "video" },
  wishes: { title: "No wishes yet", body: "Leave a few warm words for the couple.", cta: "Write a wish", action: "wish" },
};

type Props = { filter: WallFilter; onAction?: (kind: Action) => void };

export function EmptyState({ filter, onAction }: Props) {
  const { title, body, cta, action } = COPY[filter];
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-card px-5 py-9 text-center [border:var(--card-border)]">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-[13px] text-muted">{body}</p>
      {onAction && (
        <button
          type="button"
          onClick={() => onAction(action)}
          className="mt-1.5 h-11 rounded-full bg-ink px-5 text-sm font-semibold text-paper active:opacity-80"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
