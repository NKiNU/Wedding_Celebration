import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// CLAUDE.md [rule]: UI is 100% token-driven. Checks plain strings and template literals (className).
const HEX = "/#[0-9a-fA-F]{3,8}\\b/";
const FONT = "/Poppins|Pinyon|Cormorant/";
const tokenRule = [
  "error",
  ...[`Literal[value=${HEX}]`, `TemplateElement[value.raw=${HEX}]`].map((selector) => ({
    selector,
    message: "No hex colours in UI code. Use a theme token (bg-paper, text-ink, ...).",
  })),
  ...[`Literal[value=${FONT}]`, `TemplateElement[value.raw=${FONT}]`].map((selector) => ({
    selector,
    message: "No font names in UI code. Use font-sans / font-script / font-serif.",
  })),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    // layout.tsx is where next/font and the status-bar colour are wired to the tokens.
    ignores: ["src/app/layout.tsx", "src/app/fonts.ts"],
    rules: { "no-restricted-syntax": tokenRule },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
