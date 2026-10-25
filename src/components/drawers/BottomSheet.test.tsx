import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { wishPost } from "../../../tests/fixtures/posts";
import { BottomSheet } from "./BottomSheet";
import { WishViewDrawer } from "./WishViewDrawer";

function Harness({ onClosed = vi.fn() }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <BottomSheet
        open={open}
        title="Share"
        onClose={() => {
          setOpen(false);
          onClosed();
        }}
      >
        <p>Inside</p>
      </BottomSheet>
    </>
  );
}

const dialog = () => document.querySelector("dialog")!;

describe("BottomSheet", () => {
  it("is closed until opened, then opens as a titled modal dialog", () => {
    render(<Harness />);
    expect(dialog()).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Open"));
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveAttribute("aria-labelledby", screen.getByRole("heading", { name: "Share" }).id);
  });

  it("closes with the close button and returns focus to the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByText("Open");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("closes when the backdrop is tapped but not when its content is", () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByText("Inside"));
    expect(onClosed).not.toHaveBeenCalled();
    fireEvent.click(dialog());
    expect(onClosed).toHaveBeenCalled(); // the native close event may report a second time
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("tells the parent when the browser closes it (Escape)", () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent(dialog(), new Event("close"));
    expect(onClosed).toHaveBeenCalled();
  });
});

describe("WishViewDrawer", () => {
  const now = new Date("2026-10-25T12:00:00Z");

  it("shows the whole wish with its author and age", () => {
    const wish = wishPost({ wishText: "Line one\nLine two", author: "Siti" });
    render(<WishViewDrawer wish={wish} now={now} onClose={vi.fn()} />);
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByText(/Line one/).textContent).toBe("Line one\nLine two");
    expect(screen.getByText(/— Siti · 5 min ago/)).toBeInTheDocument();
  });

  it("stays closed with no wish", () => {
    render(<WishViewDrawer wish={null} now={now} onClose={vi.fn()} />);
    expect(dialog()).not.toHaveAttribute("open");
  });
});
