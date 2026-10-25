import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wishPost } from "../../../tests/fixtures/posts";
import { WishTicker } from "./WishTicker";

const wishes = ["a", "b", "c"].map((id, i) =>
  wishPost({ id: `00000000-0000-4000-8000-00000000000${i}`, wishText: `Wish ${id}`, author: `Guest ${id}` }),
);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WishTicker", () => {
  it("renders nothing without wishes", () => {
    const { container } = render(<WishTicker wishes={[]} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts on the newest wish and rotates every 4 seconds, wrapping around", () => {
    render(<WishTicker wishes={wishes} onOpen={vi.fn()} />);
    expect(screen.getByText(/Wish a/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText(/Wish b/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText(/Wish a/)).toBeInTheDocument();
  });

  it("opens the wish on screen when tapped", () => {
    const onOpen = vi.fn();
    render(<WishTicker wishes={wishes} onOpen={onOpen} />);
    act(() => void vi.advanceTimersByTime(4000));
    fireEvent.click(screen.getByRole("button", { name: /Latest wishes.*Wish b.*Guest b/ }));
    expect(onOpen).toHaveBeenCalledWith(wishes[1]);
  });

  it("holds still while the page is hidden", () => {
    render(<WishTicker wishes={wishes} onOpen={vi.fn()} />);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText(/Wish a/)).toBeInTheDocument();
  });

  it("does not rotate for guests who prefer reduced motion, or with a single wish", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { unmount } = render(<WishTicker wishes={wishes} onOpen={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText(/Wish a/)).toBeInTheDocument();
    unmount();

    vi.unstubAllGlobals();
    render(<WishTicker wishes={wishes.slice(0, 1)} onOpen={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(8000));
    expect(screen.getByText(/Wish a/)).toBeInTheDocument();
  });

  it("shows at most five wishes", () => {
    const many = Array.from({ length: 8 }, (_, i) => wishPost({ id: `00000000-0000-4000-8000-0000000001${i}` }));
    const { container } = render(<WishTicker wishes={many} onOpen={vi.fn()} />);
    expect(container.querySelectorAll("[aria-hidden] > span")).toHaveLength(5);
  });
});
