import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { image } from "../../../tests/fixtures/posts";
import { AlbumGallery } from "./AlbumGallery";

const WIDTH = 300;
const scrollTo = vi.fn();
const scrollIntoView = vi.fn();

beforeEach(() => {
  // jsdom has no layout: give the track a width, and record where the buttons send it.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(WIDTH);
  Object.assign(HTMLElement.prototype, { scrollTo, scrollIntoView });
});
afterEach(() => {
  vi.restoreAllMocks();
  scrollTo.mockClear();
  scrollIntoView.mockClear();
});

const swipeTo = (page: number) => {
  const track = screen.getByRole("list", { name: "Photos" });
  track.scrollLeft = page * WIDTH;
  act(() => void fireEvent.scroll(track));
};
const album = [image(0), image(1), image(2)];

describe("AlbumGallery", () => {
  it("shows a single photo with none of the album chrome", () => {
    render(<AlbumGallery media={[image(0)]} />);
    expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute("src", image(0).url);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Thumbnails" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Photos" })).not.toHaveAttribute("tabindex");
  });

  it("shows every photo of an album, with a counter and one thumbnail each", () => {
    render(<AlbumGallery media={album} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "Photo 2 of 3" })).toHaveAttribute("src", image(1).url);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Show photo/ })).toHaveLength(3);
  });

  it("loads the first photo at once and the others lazily", () => {
    render(<AlbumGallery media={album} />);
    const [first, second] = screen.getAllByRole("img");
    expect(first).toHaveAttribute("loading", "eager");
    expect(second).toHaveAttribute("loading", "lazy");
  });

  it("follows the swipe: the counter and the current thumbnail move with the scroll position", () => {
    render(<AlbumGallery media={album} />);
    swipeTo(2);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show photo 3 of 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Show photo 1 of 3" })).toHaveAttribute("aria-current", "false");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ inline: "center", block: "nearest" });
  });

  it("the buttons scroll one photo at a time and dim at either end, keeping focus", () => {
    render(<AlbumGallery media={album} />);
    expect(screen.getByRole("button", { name: "Previous photo" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: WIDTH });

    swipeTo(1);
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0 });

    swipeTo(2);
    const next = screen.getByRole("button", { name: "Next photo" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    next.focus();
    scrollTo.mockClear();
    fireEvent.click(next); // at the end it stays on the last photo
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * WIDTH });
    expect(next).toHaveFocus();
  });

  it("a thumbnail jumps to its photo", () => {
    render(<AlbumGallery media={album} />);
    fireEvent.click(screen.getByRole("button", { name: "Show photo 3 of 3" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * WIDTH });
  });

  it("ignores a scroll event before the track has a width", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(0);
    render(<AlbumGallery media={album} />);
    swipeTo(2);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("says so when a photo cannot be loaded", () => {
    render(<AlbumGallery media={[image(0)]} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("This photo can’t be loaded right now.")).toBeInTheDocument();
  });
});
