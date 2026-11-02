import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Monogram } from "./Monogram";

describe("Monogram", () => {
  it("shows the initials when there is no image", () => {
    const { container } = render(<Monogram a="H" b="A" />);
    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the image and not the initials when an image url is given", () => {
    const { container } = render(<Monogram a="H" b="A" imageUrl="https://media.test/mono.png" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://media.test/mono.png");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.queryByText("H")).toBeNull();
    expect(screen.queryByText("A")).toBeNull();
  });
});
