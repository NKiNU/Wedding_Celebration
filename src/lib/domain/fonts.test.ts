import { describe, expect, it } from "vitest";
import { DEFAULT_FONTS, FONT_OPTIONS, fontOrDefault, fontVar, isFontKey, themeCss } from "./fonts";

describe("FONT_OPTIONS", () => {
  it("has unique keys and includes the three defaults", () => {
    const keys = FONT_OPTIONS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => /^[a-z0-9-]+$/.test(k))).toBe(true);
    for (const key of Object.values(DEFAULT_FONTS)) expect(keys).toContain(key);
  });

  it("offers enough of each kind", () => {
    const count = (kind: string) => FONT_OPTIONS.filter((f) => f.kind === kind).length;
    expect(FONT_OPTIONS.length).toBeGreaterThanOrEqual(16);
    expect(FONT_OPTIONS.length).toBeLessThanOrEqual(20);
    expect(count("script")).toBeGreaterThanOrEqual(6);
    expect(count("serif")).toBeGreaterThanOrEqual(5);
    expect(count("sans")).toBeGreaterThanOrEqual(5);
  });
});

describe("fontOrDefault", () => {
  it("falls back to the default for null, undefined and unknown keys", () => {
    expect(fontOrDefault("names", "nope")).toBe("pinyon-script");
    expect(fontOrDefault("wishes", null)).toBe("cormorant-garamond");
    expect(fontOrDefault("body", undefined)).toBe("poppins");
  });

  it("keeps a known key", () => {
    expect(fontOrDefault("body", "lora")).toBe("lora");
  });
});

describe("isFontKey / fontVar", () => {
  it("recognises catalogue keys only", () => {
    expect(isFontKey("lora")).toBe(true);
    expect(isFontKey("nope")).toBe(false);
    expect(isFontKey(42)).toBe(false);
  });

  it("builds the css variable name", () => {
    expect(fontVar("great-vibes")).toBe("--font-great-vibes");
  });
});

describe("themeCss", () => {
  it("only ever emits var() of known keys", () => {
    expect(themeCss({ names: "x;}body{display:none", wishes: null, body: "lora" })).toBe(
      ":root{--font-choice-names:var(--font-pinyon-script);--font-choice-wishes:var(--font-cormorant-garamond);--font-choice-body:var(--font-lora)}",
    );
  });
});
