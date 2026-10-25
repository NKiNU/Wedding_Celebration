import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { image } from "../../../tests/fixtures/posts";
import { VideoPlayer } from "./VideoPlayer";

const clip = { ...image(0), kind: "video" as const, url: "https://media.example.com/0.mp4", posterUrl: "https://media.example.com/0_poster.jpg", durationS: 42 };

describe("VideoPlayer", () => {
  it("is the native player, inline, with the poster and no autoplay", () => {
    const { container } = render(<VideoPlayer media={clip} label="Video by Iman" />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("src", clip.url);
    expect(video).toHaveAttribute("poster", clip.posterUrl);
    expect(video).toHaveAttribute("aria-label", "Video by Iman");
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video).toHaveAttribute("preload", "metadata");
  });

  it("copes with a video that has no poster", () => {
    const { container } = render(<VideoPlayer media={{ ...clip, posterUrl: null }} label="Video" />);
    expect(container.querySelector("video")).not.toHaveAttribute("poster");
  });

  it("says so when the phone cannot play it", () => {
    const { container } = render(<VideoPlayer media={clip} label="Video" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByRole("alert")).toHaveTextContent("This video can’t be played on this phone.");
  });

  it("notices a failure that happened before React was listening", () => {
    // jsdom has no `error` property on media elements.
    Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => ({ code: 4 }) });
    try {
      render(<VideoPlayer media={clip} label="Video" />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(HTMLMediaElement.prototype, "error");
    }
  });
});
