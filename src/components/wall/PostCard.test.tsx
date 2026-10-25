import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { image, wallPost, wishPost } from "../../../tests/fixtures/posts";
import { PostCard } from "./PostCard";

const NOW = new Date("2026-10-25T12:00:00Z");
const show = (post = wallPost(), mine = false, onOpenWish = vi.fn()) =>
  render(<PostCard post={post} mine={mine} now={NOW} onOpenWish={onOpenWish} />);

describe("PostCard", () => {
  it("links a photo to its viewer, labelled with the author, with age and no You badge", () => {
    show();
    const link = screen.getByRole("link", { name: "Photo by Nazrul" });
    expect(link).toHaveAttribute("href", "/p/b0000000-0000-4000-8000-000000000001");
    expect(screen.getByText("5 min ago")).toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("marks the guest's own posts", () => {
    show(wallPost(), true);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows an album's photo count and fans out its photos", () => {
    const { container } = show(wallPost({ type: "album", media: [image(0), image(1), image(2), image(3)] }));
    expect(screen.getByRole("link", { name: "Album by Nazrul, 4 photos" })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("shows a video's duration over its poster", () => {
    const media = [{ kind: "video" as const, url: "v.mp4", thumbUrl: null, posterUrl: "p.jpg", durationS: 42 }];
    const { container } = show(wallPost({ type: "video", media }));
    expect(screen.getByRole("link", { name: "Video by Nazrul" })).toBeInTheDocument();
    expect(screen.getByText("0:42")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "p.jpg");
  });

  it("omits the duration badge when the length is unknown", () => {
    const media = [{ kind: "video" as const, url: "v.mp4", thumbUrl: null, posterUrl: null, durationS: null }];
    show(wallPost({ type: "video", media }));
    expect(screen.queryByText("0:00")).not.toBeInTheDocument();
  });

  it("opens a wish in place instead of navigating", () => {
    const onOpenWish = vi.fn();
    const wish = wishPost();
    show(wish, false, onOpenWish);
    fireEvent.click(screen.getByRole("button", { name: /Selamat pengantin baru!/ }));
    expect(onOpenWish).toHaveBeenCalledWith(wish);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("drops a thumbnail that fails to load and keeps the card", () => {
    const { container } = show();
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});
