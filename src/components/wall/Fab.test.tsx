import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Fab } from "./Fab";

describe("Fab", () => {
  it("offers to share a memory while the menu is closed", () => {
    render(<Fab open={false} onToggle={vi.fn()} />);
    const fab = screen.getByRole("button", { name: "Share a memory" });
    expect(fab).toHaveAttribute("aria-expanded", "false");
    expect(fab).toHaveAttribute("aria-controls", "share-menu");
  });

  it("offers to close the menu while it is open, and turns the plus into a cross", () => {
    render(<Fab open onToggle={vi.fn()} />);
    const fab = screen.getByRole("button", { name: "Close share menu" });
    expect(fab).toHaveAttribute("aria-expanded", "true");
    expect(fab.querySelector("svg")).toHaveClass("rotate-45");
  });

  it("keeps the plus upright when closed", () => {
    render(<Fab open={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button").querySelector("svg")).not.toHaveClass("rotate-45");
  });

  it("reports taps", () => {
    const onToggle = vi.fn();
    render(<Fab open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("hands its button to the parent through ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Fab open={false} onToggle={vi.fn()} ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("button"));
  });
});
