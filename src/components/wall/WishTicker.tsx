"use client";

import { useEffect, useState } from "react";
import { TICKER_WISHES } from "@/lib/domain/limits";
import type { WallPost } from "@/lib/domain/posts";

const ROTATE_MS = 4000;

type Props = { wishes: readonly WallPost[]; onOpen: (post: WallPost) => void };

/**
 * The newest wishes, one at a time. Tapping the card opens the wish. Moving text must be
 * stoppable (WCAG 2.2.2): it holds still under a pointer or focus, and the dots are a button that
 * pauses it for good (a pause glyph shows while it is paused), which is what touch guests get.
 */
export function WishTicker({ wishes, onOpen }: Props) {
  const shown = wishes.slice(0, TICKER_WISHES);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pausedByGuest, setPausedByGuest] = useState(false);
  const count = shown.length;
  const paused = hovered || focused || pausedByGuest;

  useEffect(() => {
    // A rotating text swap is motion; reduced-motion guests get the newest wish and no timer.
    if (paused || count < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;
  const position = index % count;
  const current = shown[position]!;
  return (
    <div
      className="relative mt-4"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <button
        type="button"
        onClick={() => onOpen(current)}
        className="flex w-full flex-col gap-1.5 rounded-card bg-card px-4 py-3.5 text-left transition-transform duration-100 active:scale-[0.99] [border:var(--card-border)]"
      >
        <span className="text-[11px] tracking-[0.16em] text-muted uppercase">Latest wishes</span>
        <span className="line-clamp-2 font-serif text-[19px] leading-[1.3] italic">“{current.wishText}”</span>
        <span className="text-xs text-muted">— {current.author}</span>
      </button>
      {count > 1 && (
        <button
          type="button"
          aria-pressed={pausedByGuest}
          aria-label="Pause latest wishes"
          onClick={() => setPausedByGuest((p) => !p)}
          className="absolute top-0 right-1 flex size-11 items-center justify-center rounded-full"
        >
          {pausedByGuest ? (
            <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5 fill-ink">
              <rect x="1.5" width="2.5" height="10" rx="0.6" />
              <rect x="6" width="2.5" height="10" rx="0.6" />
            </svg>
          ) : (
            <span aria-hidden="true" className="flex gap-[5px]">
              {shown.map((wish, i) => (
                <span key={wish.id} className={`block size-1.5 rounded-full ${i === position ? "bg-ink" : "bg-line"}`} />
              ))}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
