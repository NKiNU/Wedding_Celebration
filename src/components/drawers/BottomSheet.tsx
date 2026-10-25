"use client";

import { useEffect, useId, useRef } from "react";

// Drag-to-dismiss: a long pull, or a short pull that is fast enough, closes the sheet.
const DISMISS_PX = 96;
const FLICK_PX = 24;
const FLICK_PX_PER_MS = 0.6;
const SNAP_BACK = "transform 0.2s ease-out";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** An upload is running: Escape, the backdrop, the close button and dragging all do nothing. */
  busy?: boolean;
  children: React.ReactNode;
};

/**
 * Modal sheet on the native <dialog>: showModal() gives the focus trap, Escape, an inert page
 * behind it, the top layer, and focus returning to the trigger on close.
 * Dragging the handle/title row writes the transform straight to the element (no re-render per move).
 * ponytail: flick speed is the average over the whole drag, not the release speed; track the
 * last few moves if a slow-then-fast drag ever misfires.
 */
export function BottomSheet({ open, title, onClose, busy = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.style.transform = "";
      el.style.transition = "";
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const move = (clientY: number) => {
    if (!drag.current || !dialog.current) return;
    drag.current.dy = Math.max(0, clientY - drag.current.y);
    dialog.current.style.transform = `translateY(${drag.current.dy}px)`;
  };

  const release = (cancelled: boolean) => {
    const d = drag.current;
    const el = dialog.current;
    drag.current = null;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (!cancelled && (d.dy > DISMISS_PX || (d.dy > FLICK_PX && speed > FLICK_PX_PER_MS))) return onClose();
    el.style.transition = SNAP_BACK;
    el.style.transform = "";
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // `close` also fires after the parent set `open` to false (the effect above closes the
      // element): reporting that would undo a parent that moved on to another sheet. Chrome ignores
      // preventDefault on `cancel` without a fresh user gesture, so a busy sheet that was closed
      // anyway is opened again instead of being cleared under a running upload.
      onClose={() => open && (busy ? dialog.current?.showModal() : onClose())}
      onCancel={(e) => busy && e.preventDefault()}
      // The dialog spans the viewport width and its inner column fills it, so a click whose
      // target is the dialog itself landed on the backdrop.
      onClick={(e) => !busy && e.target === e.currentTarget && onClose()}
      className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[28px] bg-sheet p-0 text-ink backdrop:bg-ink/50"
    >
      <div className="flex max-h-[88dvh] flex-col overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <div
          className="flex-none touch-none"
          onPointerDown={(e) => {
            if (busy || (e.target as Element).closest("button")) return;
            drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
            if (dialog.current) dialog.current.style.transition = "";
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={() => release(false)}
          onPointerCancel={() => release(true)}
        >
          <span aria-hidden="true" className="mx-auto mt-2.5 block h-[5px] w-10 flex-none rounded-[3px] bg-line" />
          <div className="flex flex-none items-center justify-between py-1.5 pr-2.5 pl-[22px]">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex size-11 items-center justify-center rounded-full disabled:opacity-40">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-3.5 overflow-y-auto overscroll-contain px-[22px] pt-1.5 pb-[30px] [scrollbar-width:none]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
