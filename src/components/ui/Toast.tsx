"use client";

import { useEffect, useRef } from "react";

const TOAST_MS = 2600;

type Props = { message: string | null; onDone: () => void };

/**
 * One short message near the page bottom, announced politely and dismissed on its own.
 * The visible copy is a popover, so it sits in the top layer above an open drawer's backdrop
 * (a toast after "Delete" in the Me drawer would otherwise hide behind the drawer). A browser
 * without popovers still shows it, just under any open drawer.
 */
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

  const bubble = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bubble.current;
    if (!message || !el?.showPopover) return;
    el.showPopover();
    return () => {
      if (el.matches(":popover-open")) el.hidePopover();
    };
  }, [message]);

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
      {message && (
        <div
          ref={bubble}
          popover="manual"
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-5 top-auto bottom-[calc(max(1.75rem,env(safe-area-inset-bottom))+4.5rem)] z-50 m-0 h-auto w-auto overflow-visible border-0 bg-transparent p-0"
        >
          <p className="toast mx-auto w-fit rounded-2xl bg-ink px-4 py-3 text-[13px] font-medium text-paper [box-shadow:var(--toast-shadow)]">
            {message}
          </p>
        </div>
      )}
    </>
  );
}
