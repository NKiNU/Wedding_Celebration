import { MAX_NAMES_PER_PHONE } from "./limits";

/** New list with `token` as the newest entry; the oldest falls off past the per-phone maximum. */
export function addToken(tokens: readonly string[], token: string): string[] {
  return [...tokens.filter((t) => t !== token), token].slice(-MAX_NAMES_PER_PHONE);
}
