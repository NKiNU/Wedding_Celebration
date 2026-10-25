import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { image, wallPost, wishPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({
  useWall: vi.fn(),
  consumeWelcome: vi.fn(),
  observe: vi.fn(),
  disconnect: vi.fn(),
  trigger: null as null | ((visible: boolean) => void),
}));
vi.mock("./useWall", () => ({ useWall: mocks.useWall }));
vi.mock("@/lib/welcome", () => ({ consumeWelcome: mocks.consumeWelcome }));

import { Wall } from "./Wall";

const ME = { guestId: "a0000000-0000-4000-8000-000000000001", name: "Aina" };
const album = wallPost({ id: "00000000-0000-4000-8000-000000000a01", type: "album", author: "Nazrul", guestId: ME.guestId, media: [image(0), image(1), image(2)] });
const video = wallPost({ id: "00000000-0000-4000-8000-000000000a02", type: "video", author: "Iman", guestId: "other" });
const wish = wishPost({ id: "00000000-0000-4000-8000-000000000a03", wishText: "Congratulations!", author: "Siti", guestId: "other" });
const counts = { all: 3, photos: 1, videos: 1, wishes: 1 };

const wallState = (over = {}) => ({
  posts: [album, video, wish],
  counts,
  nextCursor: null,
  loading: false,
  loadError: null,
  loadMore: vi.fn(),
  ...over,
});

const show = () =>
  render(
    <Wall
      eventId="e1"
      groom="Hafiz"
      bride="Aisyah"
      headerMessage="Raikan memori"
      me={ME}
      now="2026-10-25T12:00:00Z"
      initial={{ posts: [], nextCursor: null, counts }}
    />,
  );

beforeEach(() => {
  vi.useFakeTimers();
  mocks.useWall.mockReturnValue(wallState());
  mocks.consumeWelcome.mockReturnValue(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        mocks.trigger = (isIntersecting) => cb([{ isIntersecting }]);
      }
      observe = mocks.observe;
      disconnect = mocks.disconnect;
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Wall", () => {
  it("lists every post, marks own posts, and counts memories in the header", () => {
    show();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/3 memories shared/)).toBeInTheDocument();
  });

  it("filters by type with the pills", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Videos 1" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Video by Iman" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Photos 1" }));
    expect(screen.getByRole("link", { name: "Album by Nazrul, 3 photos" })).toBeInTheDocument();
  });

  it("opens a wish in the drawer from its card and from the ticker", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Latest wishes/ }));
    expect(document.querySelector("dialog")).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("explains an empty filter once nothing is left to load", () => {
    mocks.useWall.mockReturnValue(wallState({ posts: [album], counts: { ...counts, wishes: 0 } }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Wishes 0" }));
    expect(screen.getByText("No wishes yet")).toBeInTheDocument();
  });

  it("does not claim a filter is empty while more pages may hold matches", () => {
    mocks.useWall.mockReturnValue(wallState({ posts: [album], nextCursor: "c" }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Wishes 1" }));
    expect(screen.queryByText("No wishes yet")).not.toBeInTheDocument();
  });

  it("loads the next page when the end of the list scrolls near", () => {
    const loadMore = vi.fn();
    mocks.useWall.mockReturnValue(wallState({ nextCursor: "c", loadMore }));
    show();
    expect(mocks.observe).toHaveBeenCalled();
    act(() => mocks.trigger!(false));
    expect(loadMore).not.toHaveBeenCalled();
    act(() => mocks.trigger!(true));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("observes nothing once every page is loaded", () => {
    show();
    expect(mocks.observe).not.toHaveBeenCalled();
  });

  it("shows loading and a retry for a failed page", () => {
    const loadMore = vi.fn();
    mocks.useWall.mockReturnValue(wallState({ loading: true, loadError: "Can’t reach the server.", loadMore }));
    show();
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(loadMore).toHaveBeenCalled();
  });

  it("greets a guest who just joined, once", () => {
    mocks.consumeWelcome.mockReturnValue(true);
    show();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText("Welcome, Aina!")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2600));
    expect(screen.queryByText("Welcome, Aina!")).not.toBeInTheDocument();
  });

  it("advances relative times by the server's clock, whatever the phone's clock says", () => {
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z")); // a phone years off
    show();
    expect(screen.getAllByText("5 min ago").length).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText("6 min ago").length).toBeGreaterThan(0);
    expect(screen.queryByText("5 min ago")).not.toBeInTheDocument();
  });
});
