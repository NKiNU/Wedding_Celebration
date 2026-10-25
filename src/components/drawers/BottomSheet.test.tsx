import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wishPost } from "../../../tests/fixtures/posts";
import { BottomSheet } from "./BottomSheet";
import { WishViewDrawer } from "./WishViewDrawer";

function Harness({ onClosed = vi.fn(), busy = false }: { onClosed?: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <BottomSheet
        open={open}
        title="Share"
        busy={busy}
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

// jsdom lacks PointerEvent coordinates in some versions: a MouseEvent with a pointer type name works.
const pointer = (type: string, el: Element, clientY: number) =>
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));

describe("BottomSheet drag to dismiss", () => {
  let now = 0;
  const grip = () => screen.getByRole("heading", { name: "Share" }).parentElement!.parentElement!;
  const drag = (to: number, ms: number, release = true) => {
    now = 0;
    pointer("pointerdown", grip(), 100);
    now = ms;
    pointer("pointermove", grip(), 100 + to);
    if (release) pointer("pointerup", grip(), 100 + to);
  };
  const open = (props: { busy?: boolean; onClosed?: () => void } = {}) => {
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<Harness {...props} />);
    fireEvent.click(screen.getByText("Open"));
  };
  afterEach(() => vi.restoreAllMocks());

  it("follows the finger while dragging, without letting the sheet rise above its place", () => {
    open();
    drag(60, 500, false);
    expect(dialog().style.transform).toBe("translateY(60px)");
    pointer("pointermove", grip(), 40);
    expect(dialog().style.transform).toBe("translateY(0px)");
  });

  it("dismisses after a long drag", () => {
    const onClosed = vi.fn();
    open({ onClosed });
    drag(120, 900);
    expect(onClosed).toHaveBeenCalled();
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("dismisses after a short fast flick", () => {
    const onClosed = vi.fn();
    open({ onClosed });
    drag(40, 40);
    expect(onClosed).toHaveBeenCalled();
  });

  it("snaps back after a short slow drag and a tiny fast one", () => {
    const onClosed = vi.fn();
    open({ onClosed });
    drag(40, 900);
    expect(dialog().style.transform).toBe("");
    expect(dialog().style.transition).toContain("transform");
    drag(10, 5);
    expect(onClosed).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute("open");
  });

  it("leaves the close button alone", () => {
    const onClosed = vi.fn();
    open({ onClosed });
    pointer("pointerdown", screen.getByRole("button", { name: "Close" }), 100);
    pointer("pointermove", grip(), 300);
    pointer("pointerup", grip(), 300);
    expect(dialog().style.transform).toBe("");
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("starts clean when reopened", () => {
    open();
    drag(120, 900);
    fireEvent.click(screen.getByText("Open"));
    expect(dialog().style.transform).toBe("");
    expect(dialog().style.transition).toBe("");
  });

  it("only the handle row drags: touch-action none there and nowhere else", () => {
    open();
    expect(grip()).toHaveClass("touch-none");
    expect(screen.getByText("Inside").parentElement).not.toHaveClass("touch-none");
  });

  describe("while busy", () => {
    it("ignores drag", () => {
      const onClosed = vi.fn();
      open({ busy: true, onClosed });
      drag(200, 100);
      expect(dialog().style.transform).toBe("");
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("ignores Escape and the backdrop and disables the close button", () => {
      const onClosed = vi.fn();
      open({ busy: true, onClosed });
      const cancel = new Event("cancel", { cancelable: true });
      fireEvent(dialog(), cancel);
      expect(cancel.defaultPrevented).toBe(true);
      fireEvent.click(dialog());
      expect(onClosed).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    });

    it("lets Escape through when not busy", () => {
      open();
      const cancel = new Event("cancel", { cancelable: true });
      fireEvent(dialog(), cancel);
      expect(cancel.defaultPrevented).toBe(false);
    });
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
