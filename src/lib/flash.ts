const KEY = "wm_flash";

// sessionStorage can throw (private mode, blocked storage); a missing message is harmless.

/** A message for the next page to show once, for a screen about to be replaced (the viewer after a delete). */
export function flash(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {}
}

/** The pending message, once. */
export function consumeFlash(): string | null {
  try {
    const message = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return message;
  } catch {
    return null;
  }
}
