"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** The action is running: the dialog cannot be dismissed and the confirm button says so. */
  pending?: boolean;
  /** Why the last attempt failed; the dialog stays open so the guest can try again. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const BUTTON =
  "h-12 flex-1 rounded-3xl text-sm font-semibold transition-transform duration-100 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100";

/**
 * A centred alert on the native <dialog>: showModal() gives the focus trap, Escape and an inert
 * page behind it. Focus starts on the first button, the safe one (cancel).
 */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, pending = false, error, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Escape: the parent owns `open`, so the dialog closes through state, not by itself.
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      // Chrome ignores preventDefault on `cancel` without a fresh gesture: a dialog that closed
      // under a running request is opened again.
      onClose={() => (open ? (pending ? dialog.current?.showModal() : onCancel()) : undefined)}
      // The inner column fills the dialog, so a click that targets the dialog itself hit the backdrop.
      onClick={(e) => !pending && e.target === e.currentTarget && onCancel()}
      className="m-auto w-[calc(100%-48px)] max-w-sm rounded-3xl bg-sheet p-0 text-ink backdrop:bg-ink/55"
    >
      <div className="flex flex-col gap-2 p-[22px]">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={bodyId} className="text-sm text-muted">
          {body}
        </p>
        {error && (
          <p role="alert" className="text-[13px] font-medium">
            {error}
          </p>
        )}
        <div className="mt-2.5 flex gap-2.5">
          <button type="button" onClick={onCancel} disabled={pending} className={`${BUTTON} bg-soft text-ink`}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className={`${BUTTON} bg-ink text-paper`}>
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
