"use client";

import { useEffect, useRef } from "react";

const TOAST_MS = 2600;

type Props = { message: string | null; onDone: () => void };

/** One short message near the page bottom, announced politely and dismissed on its own. */
export function Toast({ message, onDone }: Props) {
  // The parent passes a fresh callback every render; keep the timer from restarting with it.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => done.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-5 bottom-[max(2.25rem,env(safe-area-inset-bottom))] z-50 flex justify-center"
    >
      {message && <p className="toast rounded-2xl bg-ink px-4 py-3 text-[13px] font-medium text-paper [box-shadow:var(--toast-shadow)]">{message}</p>}
    </div>
  );
}
