import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  describe("photo strip", () => {
    const strip = wallPost({ type: "strip", author: "Aina", caption: "Photobooth!", media: [image(9), image(1), image(2), image(3)] });
    const setNavigator = (share?: (data: ShareData) => Promise<void>, canShare = true) => {
      Object.defineProperty(navigator, "canShare", { value: share ? () => canShare : undefined, configurable: true });
      Object.defineProperty(navigator, "share", { value: share, configurable: true });
    };
    const shareButton = () => screen.getByRole("button", { name: "Share photo strip" });
    const openSheet = async () => {
      await fileLoaded(); // let the file land in state before the tap
      fireEvent.click(shareButton());
    };
    const toApps = () => screen.getByRole("button", { name: "Share", exact: true });
    const saveToPhone = () => screen.getByRole("button", { name: "Save to phone" });
    const fetchStrip = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }) }) as Response);
    const fileLoaded = () => act(() => new Promise<void>((done) => setTimeout(done, 20)));

    beforeEach(() => vi.stubGlobal("fetch", fetchStrip));
    afterEach(() => setNavigator(undefined));

    it("shows only the finished image, without gallery chrome, and the caption", () => {
      show(strip);
      expect(screen.getByText("5 min ago · Photo strip")).toBeInTheDocument();
      const img = screen.getByRole("img", { name: "Photo strip: 3 photos in the wedding template" });
      expect(img).toHaveAttribute("src", "https://media.example.com/9.jpg");
      expect(screen.getAllByRole("img")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
      expect(screen.getByText("Photobooth!")).toBeInTheDocument();
    });

    it("offers Share only to the owner, and fetches nothing for anyone else", () => {
      const { unmount } = show(strip, false);
      expect(screen.queryByRole("button", { name: "Share photo strip" })).not.toBeInTheDocument();
      expect(screen.queryByText(/long-press/)).not.toBeInTheDocument();
      expect(fetchStrip).not.toHaveBeenCalled();
      unmount();
      show(strip, true);
      expect(shareButton()).toHaveTextContent("Share");
      expect(screen.queryByRole("button", { name: /Save image/ })).not.toBeInTheDocument(); // Share replaced Save
      expect(screen.getByText("Long-press the image and tap Save to Photos.")).toBeInTheDocument();
      expect(fetchStrip).toHaveBeenCalledTimes(1);
      expect(fetchStrip).toHaveBeenCalledWith(`/api/posts/${strip.id}/strip`);
    });

    it("never offers Share on an album, even to its owner", () => {
      show(album, true);
      expect(screen.queryByRole("button", { name: "Share photo strip" })).not.toBeInTheDocument();
    });

    it("opens a sheet with Share and Save to phone, its title for screen readers only", async () => {
      setNavigator(vi.fn(async () => {}));
      show(strip, true);
      await openSheet();
      const sheet = screen.getByRole("dialog", { name: "Share photo strip" });
      expect(within(sheet).getByRole("button", { name: "Share", exact: true })).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Save to phone" })).toBeInTheDocument();
      expect(within(sheet).queryByRole("heading", { name: "Share photo strip" })).toHaveClass("sr-only");
    });

    it("shares the image file, with no text, and closes the sheet", async () => {
      const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
      setNavigator(share);
      show(strip, true);
      await openSheet();
      fireEvent.click(toApps());
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const data = share.mock.calls[0]![0];
      expect(data.text).toBeUndefined();
      expect(data.files).toHaveLength(1);
      expect(data.files![0]!.name).toBe("photo-strip.jpg");
      expect(data.files![0]!.type).toBe("image/jpeg");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("stays open and quiet when the guest closes the share sheet", async () => {
      setNavigator(vi.fn(async () => Promise.reject(new DOMException("closed", "AbortError"))));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      show(strip, true);
      await openSheet();
      fireEvent.click(toApps());
      await waitFor(() => expect(navigator.share).toHaveBeenCalled());
      expect(click).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Share photo strip" })).toBeInTheDocument();
      click.mockRestore();
    });

    it("ignores a second tap while the share sheet is still up", async () => {
      let finish = () => {};
      const share = vi.fn(() => new Promise<void>((done) => (finish = done)));
      setNavigator(share);
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      show(strip, true);
      await openSheet();
      fireEvent.click(toApps());
      fireEvent.click(toApps());
      expect(share).toHaveBeenCalledTimes(1);
      expect(click).not.toHaveBeenCalled();
      await act(async () => finish());
      click.mockRestore();
    });

    it("downloads instead when the share sheet refuses", async () => {
      setNavigator(vi.fn(async () => Promise.reject(new DOMException("no", "NotAllowedError"))));
      URL.createObjectURL = vi.fn(() => "blob:strip");
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      show(strip, true);
      await openSheet();
      fireEvent.click(toApps());
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(click.mock.contexts[0]).toHaveProperty("download", "photo-strip.jpg");
      click.mockRestore();
    });

    it("Save to phone downloads the image, even on a phone that can share", async () => {
      setNavigator(vi.fn(async () => {}));
      URL.createObjectURL = vi.fn(() => "blob:strip");
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      show(strip, true);
      await openSheet();
      fireEvent.click(saveToPhone());
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(click.mock.contexts[0]).toHaveProperty("download", "photo-strip.jpg");
      expect(click.mock.contexts[0]).toHaveProperty("href", "blob:strip");
      expect(navigator.share).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      click.mockRestore();
    });

    it("offers only Save to phone when the phone cannot share files", async () => {
      setNavigator(vi.fn(async () => {}), false);
      show(strip, true);
      await openSheet();
      expect(screen.queryByRole("button", { name: "Share", exact: true })).not.toBeInTheDocument();
      expect(saveToPhone()).toBeInTheDocument();
    });

    it("saves through the owner route itself when the image never arrived", async () => {
      fetchStrip.mockResolvedValueOnce({ ok: false } as Response);
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      show(strip, true);
      await openSheet();
      expect(screen.queryByRole("button", { name: "Share", exact: true })).not.toBeInTheDocument();
      fireEvent.click(saveToPhone());
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(click.mock.contexts[0]).toHaveProperty("href", expect.stringMatching(new RegExp(`/api/posts/${strip.id}/strip$`)));
      click.mockRestore();
    });
  });
});
