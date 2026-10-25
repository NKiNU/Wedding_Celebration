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
  const count = shown.length;

  useEffect(() => {
    // A rotating text swap is motion; reduced-motion guests get the newest wish and no timer.
    if (count < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;
  const position = index % count;
  const current = shown[position]!;
  return (
    <button
      type="button"
      onClick={() => onOpen(current)}
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
