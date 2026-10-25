type Props = { open: boolean; onToggle: () => void; ref?: React.Ref<HTMLButtonElement> };

/** The + button that opens the share menu; the plus turns into a cross while it is open. */
export function Fab({ open, onToggle, ref }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="share-menu"
      aria-label={open ? "Close share menu" : "Share a memory"}
      className="fixed right-[max(1.25rem,env(safe-area-inset-right))] bottom-[max(1.75rem,env(safe-area-inset-bottom))] z-30 flex size-[60px] items-center justify-center rounded-full bg-ink text-paper [box-shadow:var(--fab-shadow)] active:scale-95"
    >
      <svg
        aria-hidden="true"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`transition-transform duration-[250ms] ${open ? "rotate-45" : ""}`}
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
