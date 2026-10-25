/** Hairline frame inset from the screen edge, kept clear of the notch and home indicator. */
export function LaceFrame() {
  return (
    <span
      aria-hidden="true"
      className="decor pointer-events-none absolute inset-x-3.5 top-[max(14px,env(safe-area-inset-top))] bottom-[max(14px,env(safe-area-inset-bottom))] rounded-[28px] border border-line"
    />
  );
}
