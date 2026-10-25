"use client";

import { useEffect, useRef } from "react";

export type ShareKind = "photos" | "video" | "wish";

type Props = {
  open: boolean;
  onPick: (kind: ShareKind) => void;
  onClose: () => void;
  /** Called before onPick: the dialog that opens next must record the FAB as its opener. */
  returnFocus: () => void;
};

const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Photos comes first so it is the focus target and sits nearest the thumb: the list is laid out bottom-up.
const ITEMS: { kind: ShareKind; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    kind: "photos",
    label: "Photos",
    sub: "1 photo or an album",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="M21 15.5l-5-4.5-9.5 8" />
      </>
    ),
  },
  {
    kind: "video",
    label: "Video",
    sub: "Up to 60 seconds",
    icon: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2.5" />
        <path d="M16 10.5l5-3v9l-5-3" />
      </>
    ),
  },
  {
    kind: "wish",
    label: "Wish",
    sub: "Write to the couple",
    icon: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  },
];

const SURFACE = "bg-card [border:var(--dial-border)] [box-shadow:var(--dial-shadow)]";

/** Speed-dial above the FAB. Always rendered so it can fade; `inert` keeps it out of reach while closed. */
export function ActionMenu({ open, onPick, onClose, returnFocus }: Props) {
  const list = useRef<HTMLUListElement>(null);
  // The parent passes a fresh callback every render; keep it from re-running (and re-focusing) the effect.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={-1}
        inert={!open}
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-ink/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <ul
        ref={list}
        id="share-menu"
        aria-label="Share something"
        inert={!open}
        className={`fixed right-[max(1.25rem,env(safe-area-inset-right))] bottom-[calc(max(1.75rem,env(safe-area-inset-bottom))+4.625rem)] z-25 m-0 flex list-none flex-col-reverse items-end gap-3 p-0 transition-[opacity,transform] duration-200 ${
          open ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0"
        }`}
      >
        {ITEMS.map(({ kind, label, sub, icon }) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => {
                returnFocus();
                onPick(kind);
              }}
              className="flex items-center gap-3 text-right active:opacity-80"
            >
              <span className={`flex flex-col rounded-2xl px-3.5 py-[7px] ${SURFACE}`}>
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-[11px] text-muted">{sub}</span>
              </span>
              <span aria-hidden="true" className={`flex size-[50px] items-center justify-center rounded-full ${SURFACE}`}>
                <svg aria-hidden="true" {...ICON}>
                  {icon}
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
