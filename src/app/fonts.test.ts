// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT_OPTIONS, fontVar } from "@/lib/domain/fonts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("fonts.ts", () => {
  it("declares a variable for every catalogue key", () => {
    const source = read("./fonts.ts");
    for (const { key } of FONT_OPTIONS) expect(source).toContain(`"${fontVar(key)}"`);
  });
});

describe("theme.css", () => {
  it("keeps the wireframe theme overriding all three font tokens", () => {
    const css = read("../styles/theme.css");
    const block = css.slice(css.indexOf('[data-theme="wireframe"] {'));
    const wireframe = block.slice(0, block.indexOf("}"));
    for (const token of ["--font-body", "--font-script", "--font-serif"]) {
      expect(wireframe).toContain(`${token}: system-ui`);
    }
  });
});
