"use client";

import { useEffect, useState } from "react";
import type { WallPost } from "@/lib/domain/posts";

const TICKER_SIZE = 5;
const ROTATE_MS = 4000;

type Props = { wishes: readonly WallPost[]; onOpen: (post: WallPost) => void };

/** The newest wishes, one at a time. Tapping the card opens the wish. */
export function WishTicker({ wishes, onOpen }: Props) {
  const shown = wishes.slice(0, TICKER_SIZE);
  const [index, setIndex] = useState(0);
  // WCAG 2.2.2: auto-updating text must be pausable. Pointer over it or keyboard focus on it holds the wish still.
  const [paused, setPaused] = useState(false);
  const count = shown.length;

  useEffect(() => {
    // A rotating text swap is motion; reduced-motion guests get the newest wish and no timer.
    if (count < 2 || paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;
  const position = index % count;
  const current = shown[position]!;
  return (
    <button
      type="button"
      onClick={() => onOpen(current)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      // Keyboard focus only: after a tap (and after the wish drawer hands focus back) the button
      // keeps focus on Android, which would freeze the ticker on one wish.
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative mt-4 flex w-full flex-col gap-1.5 rounded-card bg-card px-4 py-3.5 text-left transition-transform duration-100 active:scale-[0.99] [border:var(--card-border)]"
    >
      <span className="flex items-center justify-between text-[11px] tracking-[0.16em] text-muted uppercase">
        <span>Latest wishes</span>
        <span aria-hidden="true" className="flex gap-[5px]">
          {shown.map((wish, i) => (
            <span key={wish.id} className={`block size-1.5 rounded-full ${i === position ? "bg-ink" : "bg-line"}`} />
          ))}
        </span>
      </span>
      <span className="line-clamp-2 font-serif text-[19px] leading-[1.3] italic">“{current.wishText}”</span>
      <span className="text-xs text-muted">— {current.author}</span>
    </button>
  );
}
