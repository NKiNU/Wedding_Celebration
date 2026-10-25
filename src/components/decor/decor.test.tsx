import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Floral } from "./Floral";
import { LaceFrame } from "./LaceFrame";

// Decorations are purely visual: hidden from assistive tech and droppable by a theme via `.decor`.
describe("decor", () => {
  it("Floral is decorative and carries the class a theme uses to hide it", () => {
    const { container } = render(<Floral className="absolute" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("decor", "absolute");
  });

  it("the short Floral variant omits the small flower and last leaf", () => {
    const full = render(<Floral />).container;
    const short = render(<Floral full={false} />).container;
    expect(short.querySelectorAll("path").length).toBeLessThan(full.querySelectorAll("path").length);
    expect(short.querySelectorAll("g").length).toBeLessThan(full.querySelectorAll("g").length);
  });

  it("LaceFrame is decorative and themeable", () => {
    const { container } = render(<LaceFrame />);
    const frame = container.firstElementChild!;
    expect(frame).toHaveAttribute("aria-hidden", "true");
    expect(frame).toHaveClass("decor");
  });
});
