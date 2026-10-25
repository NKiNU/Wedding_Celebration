import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
});
