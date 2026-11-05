"use client";

import { useLinkStatus } from "next/link";

/** Over the tapped card while its viewer loads, so a slow network never looks like a missed tap. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    // The fade starts after a short delay (globals.css), so a fast open never flashes it.
    <span aria-hidden="true" className="pending-in absolute inset-0 flex items-center justify-center rounded-media bg-overlay-soft">
      <span className="size-7 animate-spin rounded-full border-[3px] border-overlay-ink/30 border-t-overlay-ink motion-reduce:animate-none" />
    </span>
  );
}
