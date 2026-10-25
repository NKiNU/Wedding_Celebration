import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { wishPost } from "../../../tests/fixtures/posts";
import { WishViewDrawer } from "./WishViewDrawer";

const now = new Date("2026-10-25T12:00:00Z");
const dialog = () => document.querySelector("dialog")!;
const show = (over: Partial<React.ComponentProps<typeof WishViewDrawer>> = {}) =>
  render(<WishViewDrawer wish={wishPost()} now={now} mine={false} onDelete={vi.fn()} onClose={vi.fn()} {...over} />);

describe("WishViewDrawer", () => {
  it("shows the whole wish with its author and age", () => {
    show({ wish: wishPost({ wishText: "Line one\nLine two", author: "Siti" }) });
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByText(/Line one/).textContent).toBe("Line one\nLine two");
    expect(screen.getByText(/— Siti · 5 min ago/)).toBeInTheDocument();
  });

  it("stays closed with no wish", () => {
    show({ wish: null });
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("offers no delete on someone else's wish", () => {
    show();
    expect(screen.queryByRole("button", { name: "Delete my wish" })).not.toBeInTheDocument();
  });

  it("lets the author delete their own wish", () => {
    const onDelete = vi.fn();
    const wish = wishPost();
    show({ wish, mine: true, onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete my wish" }));
    expect(onDelete).toHaveBeenCalledWith(wish);
  });
});
