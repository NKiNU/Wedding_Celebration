"use client";

import { useEffect, useId, useRef } from "react";

type Props = { open: boolean; title: string; onClose: () => void; children: React.ReactNode };

/**
 * Modal sheet on the native <dialog>: showModal() gives the focus trap, Escape, an inert page
 * behind it, the top layer, and focus returning to the trigger on close.
 * ponytail: no drag-to-dismiss yet; add a pointer handler on the handle if guests ask for it.
 */
export function BottomSheet({ open, title, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // The dialog spans the viewport width and its inner column fills it, so a click whose
      // target is the dialog itself landed on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[28px] bg-sheet p-0 text-ink backdrop:bg-ink/50"
    >
      <div className="flex max-h-[88dvh] flex-col overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-[5px] w-10 flex-none rounded-[3px] bg-line" />
        <div className="flex flex-none items-center justify-between py-1.5 pr-2.5 pl-[22px]">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-3.5 overflow-y-auto overscroll-contain px-[22px] pt-1.5 pb-[30px] [scrollbar-width:none]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
