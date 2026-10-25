import { NAME_MAX, NAME_MIN } from "./limits";

/** Control, format and default-ignorable characters (zero-width, bidi overrides, fillers) are
 *  invisible, so they could fake a name. This also splits emoji ZWJ sequences: accepted, because
 *  an invisible difference would let one guest pose as another. Tab, newline and CR are left for
 *  the whitespace collapse below. */
const INVISIBLE = /(?![\t\n\r])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

export function normalizeName(raw: string): string {
  return raw.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

const length = (name: string) => Array.from(name).length;

/** A user-facing reason the (already normalized) name is unusable, or null when it is fine. */
export function nameProblem(name: string): string | null {
  if (length(name) < NAME_MIN) return `Please enter at least ${NAME_MIN} characters.`;
  if (length(name) > NAME_MAX) return `Names can be up to ${NAME_MAX} characters.`;
  return null;
}

/**
 * Up to two free alternatives to a taken name. `taken` holds lower-cased names; only names
 * that would still be valid are offered.
 */
export function suggestNames(name: string, taken: ReadonlySet<string>): string[] {
  const candidates = [`${name} 2`, `${name} & family`, `${name} 3`, `${name} 4`];
  return candidates
    .filter((c) => length(c) <= NAME_MAX && !taken.has(c.toLowerCase()))
    .slice(0, 2);
}
