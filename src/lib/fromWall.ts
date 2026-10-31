const KEY = "wm_from_wall";

// sessionStorage can throw (private mode, blocked storage); the viewer then just goes to the wall.

/** A card on the wall was tapped: the page before this post is the wall, so Back may go there. */
export function markFromWall(postId: string): void {
  try {
    sessionStorage.setItem(KEY, postId);
  } catch {}
}

/** The guest reached this post from the wall (not from a link in another app). */
export function cameFromWall(postId: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === postId;
  } catch {
    return false;
  }
}
