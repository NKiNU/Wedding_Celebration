"use client";

import { useState } from "react";
import type { WallMedia } from "@/lib/domain/posts";

/** The phone's own player: `playsInline` keeps iOS from forcing full screen, and nothing autoplays. */
export function VideoPlayer({ media, label }: { media: WallMedia; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <video
        src={media.url}
        poster={media.posterUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={label}
        // A load that failed before React attached onError never reports; check once on mount.
        ref={(video) => {
          if (video?.error) setFailed(true);
        }}
        onError={() => setFailed(true)}
        className="max-h-full w-full bg-viewer"
      />
      {failed && (
        <p role="alert" className="px-6 text-center text-sm text-overlay-ink/70">
          This video can’t be played on this phone.
        </p>
      )}
    </div>
  );
}
