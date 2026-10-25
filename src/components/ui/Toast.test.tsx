import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Toast", () => {
  it("announces the message and reports done after a few seconds", () => {
    const onDone = vi.fn();
    render(<Toast message="Welcome, Aina!" onDone={onDone} />);
    expect(screen.getByRole("status")).toHaveTextContent("Welcome, Aina!");
    act(() => void vi.advanceTimersByTime(2599));
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty live region ready and sets no timer without a message", () => {
    const onDone = vi.fn();
    render(<Toast message={null} onDone={onDone} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => void vi.advanceTimersByTime(5000));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does not restart its timer when the parent re-renders with a new callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Toast message="Hi" onDone={first} />);
    act(() => void vi.advanceTimersByTime(2000));
    rerender(<Toast message="Hi" onDone={second} />);
    act(() => void vi.advanceTimersByTime(600));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("shows the visible copy in the top layer and hides it again when the message goes", () => {
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.assign(HTMLElement.prototype, { showPopover, hidePopover });
    // jsdom rejects the :popover-open selector; answer it, and leave every other selector alone.
    const original = Element.prototype.matches;
    const matches = vi
      .spyOn(Element.prototype, "matches")
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ":popover-open" || original.call(this, selector);
      });
    try {
      const { rerender } = render(<Toast message="Post deleted" onDone={vi.fn()} />);
      expect(showPopover).toHaveBeenCalledOnce();
      expect(screen.getByText("Post deleted", { selector: "p" }).parentElement).toHaveAttribute("popover", "manual");
      rerender(<Toast message={null} onDone={vi.fn()} />);
      expect(hidePopover).toHaveBeenCalledOnce();
    } finally {
      matches.mockRestore();
      Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
      Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
    }
  });
});
