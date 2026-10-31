import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markFromWall } from "@/lib/fromWall";
import { image, wallPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({ api: vi.fn(), back: vi.fn(), replace: vi.fn(), flash: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/flash", () => ({ flash: mocks.flash }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back, replace: mocks.replace }) }));

import { PostViewer } from "./PostViewer";

const NOW = "2026-10-25T12:00:00Z";
const album = wallPost({ type: "album", author: "Nazrul", caption: "Akad nikah", media: [image(0), image(1), image(2)] });
const photo = wallPost({ author: "Ali", media: [image(0)] });
const video = wallPost({
  type: "video",
  author: "Iman",
  caption: null,
  media: [{ kind: "video", url: "https://media.example.com/v.mp4", thumbUrl: null, posterUrl: "https://media.example.com/v_poster.jpg", durationS: 42 }],
});
const show = (post = album, mine = false) => render(<PostViewer post={post} mine={mine} now={NOW} />);

beforeEach(() => {
  mocks.api.mockResolvedValue({ ok: true, data: null });
  vi.stubGlobal("location", { replace: mocks.load });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PostViewer", () => {
  it("shows who shared it, how long ago, what kind, and the caption", () => {
    show();
    expect(screen.getByRole("heading", { name: "Nazrul" })).toBeInTheDocument();
    expect(screen.getByText("5 min ago · Album · 3 photos")).toBeInTheDocument();
    expect(screen.getByText("Akad nikah")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("shows a photo without album chrome, and no caption paragraph when there is none", () => {
    show(photo);
    expect(screen.getByText("5 min ago · Photo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
  });

  it("plays a video in the native player", () => {
    const { container } = show(video);
    expect(screen.getByText("5 min ago · Video")).toBeInTheDocument();
    expect(container.querySelector("video")).toHaveAttribute("src", "https://media.example.com/v.mp4");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("offers delete only to the author", () => {
    const { unmount } = show(album, false);
    expect(screen.queryByRole("button", { name: "Delete this post" })).not.toBeInTheDocument();
    unmount();
    show(album, true);
    expect(screen.getByRole("button", { name: "Delete this post" })).toBeInTheDocument();
  });

  describe("back", () => {
    afterEach(() => sessionStorage.clear());

    it("returns to the wall when a card on it opened this post", () => {
      vi.stubGlobal("history", { length: 3 });
      markFromWall(album.id);
      show();
      fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
      expect(mocks.back).toHaveBeenCalledOnce();
    });

    it("goes to the wall, not back into another app, when the link came from outside", () => {
      vi.stubGlobal("history", { length: 3 }); // the tab has history, but it is WhatsApp's
      show();
      fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
      expect(mocks.replace).toHaveBeenCalledWith("/wall");
      expect(mocks.back).not.toHaveBeenCalled();
    });

    it("ignores a card tap on a different post", () => {
      vi.stubGlobal("history", { length: 3 });
      markFromWall("00000000-0000-4000-8000-000000000999"); // the fixtures share one default id
      show();
      fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
      expect(mocks.replace).toHaveBeenCalledWith("/wall");
    });

    it("goes to the wall when the tab has no history, even after a card tap", () => {
      vi.stubGlobal("history", { length: 1 });
      markFromWall(album.id);
      show();
      fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
      expect(mocks.replace).toHaveBeenCalledWith("/wall");
      expect(mocks.back).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    const confirm = () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    it("asks first, then deletes, leaves a message for the wall and goes back to it", async () => {
      show(album, true);
      fireEvent.click(screen.getByRole("button", { name: "Delete this post" }));
      expect(screen.getByRole("alertdialog", { name: "Delete this album?" })).toBeInTheDocument();
      expect(mocks.api).not.toHaveBeenCalled();

      confirm();
      await waitFor(() => expect(mocks.load).toHaveBeenCalledWith("/wall"));
      expect(mocks.replace).not.toHaveBeenCalled(); // a full load, not the client router
      expect(mocks.api).toHaveBeenCalledWith(`/api/posts/${album.id}`, "DELETE");
      expect(mocks.flash).toHaveBeenCalledWith("Post deleted");
    });

    it("stays on the post when the guest keeps it", () => {
      show(album, true);
      fireEvent.click(screen.getByRole("button", { name: "Delete this post" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
      expect(mocks.api).not.toHaveBeenCalled();
      expect(mocks.load).not.toHaveBeenCalled();
    });

    it("stays and explains when the delete fails", async () => {
      mocks.api.mockResolvedValue({ ok: false, error: { code: "internal", message: "Something went wrong. Please try again." } });
      show(album, true);
      fireEvent.click(screen.getByRole("button", { name: "Delete this post" }));
      confirm();
      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.flash).not.toHaveBeenCalled();
    });
  });
});
