import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Thumb } from "./Thumb";

const tile = (c: HTMLElement) => c.firstElementChild as HTMLElement;

describe("Thumb", () => {
  it("shimmers until the photo loads, then fades it in", () => {
    const { container } = render(<Thumb src="https://media.test/a_thumb.jpg" />);
    const img = container.querySelector("img")!;
    expect(tile(container).className).toContain("media-loading");
    Object.defineProperty(img, "naturalWidth", { configurable: true, value: 600 });
    fireEvent.load(img);
    expect(tile(container).className).not.toContain("media-loading");
    expect(container.querySelector("img")!.className).toContain("opacity-100");
  });

  it("drops the shimmer and the image when the file fails", () => {
    const { container } = render(<Thumb src="https://media.test/missing.jpg" />);
    const img = container.querySelector("img");
    if (img) fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(tile(container).className).not.toContain("media-loading");
  });

  it("is a plain tile with no image when there is none", () => {
    const { container } = render(<Thumb src={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(tile(container).className).not.toContain("media-loading");
  });
});
