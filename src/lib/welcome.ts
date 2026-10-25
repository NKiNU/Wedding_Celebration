const KEY = "wm_welcome";

// sessionStorage can throw (private mode, blocked storage); a missing greeting is harmless.

/** Called by the join form just before it leaves for the wall. */
export function flagWelcome(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}

/** True once after a join, so the wall can greet the guest exactly one time. */
export function consumeWelcome(): boolean {
  try {
    const flagged = sessionStorage.getItem(KEY) !== null;
    sessionStorage.removeItem(KEY);
    return flagged;
  } catch {
    return false;
  }
}
