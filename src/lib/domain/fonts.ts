export type FontRole = "names" | "wishes" | "body";
export type FontKind = "script" | "serif" | "sans";
export type FontOption = { key: string; label: string; kind: FontKind };

/** Curated Google Fonts (all cover Latin, so Malay text is fine). Keys are the kebab-case family. */
export const FONT_OPTIONS: readonly FontOption[] = [
  { key: "pinyon-script", label: "Pinyon Script", kind: "script" },
  { key: "great-vibes", label: "Great Vibes", kind: "script" },
  { key: "dancing-script", label: "Dancing Script", kind: "script" },
  { key: "allura", label: "Allura", kind: "script" },
  { key: "parisienne", label: "Parisienne", kind: "script" },
  { key: "alex-brush", label: "Alex Brush", kind: "script" },
  { key: "sacramento", label: "Sacramento", kind: "script" },
  { key: "cormorant-garamond", label: "Cormorant Garamond", kind: "serif" },
  { key: "playfair-display", label: "Playfair Display", kind: "serif" },
  { key: "lora", label: "Lora", kind: "serif" },
  { key: "libre-baskerville", label: "Libre Baskerville", kind: "serif" },
  { key: "eb-garamond", label: "EB Garamond", kind: "serif" },
  { key: "poppins", label: "Poppins", kind: "sans" },
  { key: "montserrat", label: "Montserrat", kind: "sans" },
  { key: "inter", label: "Inter", kind: "sans" },
  { key: "nunito", label: "Nunito", kind: "sans" },
  { key: "lato", label: "Lato", kind: "sans" },
  { key: "raleway", label: "Raleway", kind: "sans" },
];

export const DEFAULT_FONTS: Record<FontRole, string> = {
  names: "pinyon-script",
  wishes: "cormorant-garamond",
  body: "poppins",
};

const KEYS: ReadonlySet<string> = new Set(FONT_OPTIONS.map((f) => f.key));

export const isFontKey = (key: unknown): key is string => typeof key === "string" && KEYS.has(key);

export const fontOrDefault = (role: FontRole, key: string | null | undefined): string =>
  isFontKey(key) ? key : DEFAULT_FONTS[role];

export const fontVar = (key: string): string => `--font-${key}`;

/** CSS for the chosen fonts. Every value goes through `fontOrDefault`, so nothing but a catalogue key is emitted. */
export function themeCss(fonts: Record<FontRole, string | null | undefined>): string {
  const roles: FontRole[] = ["names", "wishes", "body"];
  const decls = roles.map((r) => `--font-choice-${r}:var(${fontVar(fontOrDefault(r, fonts[r]))})`);
  return `:root{${decls.join(";")}}`;
}
