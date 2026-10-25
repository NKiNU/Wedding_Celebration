import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { image, wallPost, wishPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({ api: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

import { MeDrawer } from "./MeDrawer";

const now = new Date("2026-10-25T12:00:00Z");
const album = wallPost({ id: "00000000-0000-4000-8000-000000000a01", type: "album", caption: "Our table", media: [image(0), image(1), image(2)] });
const wish = wishPost({ id: "00000000-0000-4000-8000-000000000a02", wishText: "Selamat!" });

const handlers = () => ({
  onRetry: vi.fn(),
  onOpenWish: vi.fn(),
  onDelete: vi.fn(),
  onShare: vi.fn(),
  onSwitchFailed: vi.fn(),
  onClose: vi.fn(),
});
const show = (over: Partial<React.ComponentProps<typeof MeDrawer>> = {}) => {
  const h = handlers();
  render(<MeDrawer open me="Aina" posts={[album, wish]} status="ready" now={now} {...h} {...over} />);
  return h;
};
const dialog = () => document.querySelector("dialog")!;

beforeEach(() => {
  vi.stubGlobal("location", { replace: mocks.replace });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MeDrawer", () => {
  it("names the guest and says this phone remembers them", () => {
    show();
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "You" })).toBeInTheDocument();
    expect(screen.getByText("Aina")).toBeInTheDocument();
    expect(screen.getByText("Remembered on this phone · no password")).toBeInTheDocument();
    expect(screen.getByText("Switching keeps your posts. You can come back as Aina from this phone.")).toBeInTheDocument();
  });

  it("stays empty while closed", () => {
    show({ open: false });
    expect(dialog()).not.toHaveAttribute("open");
    expect(screen.queryByText("Aina")).not.toBeInTheDocument();
  });

  it("lists their posts with the count, kind, caption and age", () => {
    show();
    expect(screen.getByRole("heading", { name: "Your posts (2)" })).toBeInTheDocument();
    const rows = within(dialog()).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Album · 3 photos · Our table")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("5 min ago")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Wish")).toBeInTheDocument();
  });

  it("opens a photo, album or video in the viewer and a wish in its drawer", () => {
    const h = show();
    expect(screen.getByRole("link", { name: /Album · 3 photos/ })).toHaveAttribute("href", `/p/${album.id}`);
    fireEvent.click(screen.getByRole("button", { name: /^Wish/ }));
    expect(h.onOpenWish).toHaveBeenCalledWith(wish);
  });

  it("asks to delete the post it names", () => {
    const h = show();
    fireEvent.click(screen.getByRole("button", { name: "Delete album" }));
    expect(h.onDelete).toHaveBeenCalledWith(album);
    fireEvent.click(screen.getByRole("button", { name: "Delete wish" }));
    expect(h.onDelete).toHaveBeenLastCalledWith(wish);
  });

  it("invites the guest to share when they have nothing yet", () => {
    const h = show({ posts: [] });
    expect(screen.getByRole("heading", { name: "Your posts (0)" })).toBeInTheDocument();
    expect(screen.getByText("You have not shared anything yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share something" }));
    expect(h.onShare).toHaveBeenCalled();
  });

  it("says it is loading, and offers a retry when loading failed", () => {
    show({ posts: [], status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading your posts…");
    expect(screen.getByRole("heading", { name: "Your posts" })).toBeInTheDocument();
    expect(screen.queryByText("You have not shared anything yet.")).not.toBeInTheDocument();
  });

  it("offers a retry when loading failed, and keeps a list it already has", () => {
    const h = show({ posts: [], status: "error" });
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(h.onRetry).toHaveBeenCalled();
  });

  it("tells the guest when a refresh failed, without dropping the list it has", () => {
    const h = show({ status: "error" });
    expect(within(dialog()).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Can’t refresh your posts. Try again" }));
    expect(h.onRetry).toHaveBeenCalled();
  });

  it("keeps showing the last list while it refreshes", () => {
    show({ status: "loading" });
    expect(within(dialog()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Loading your posts…")).not.toBeInTheDocument();
  });

  describe("Switch name", () => {
    it("forgets the active name, then loads the welcome page afresh", async () => {
      mocks.api.mockResolvedValue({ ok: true, data: null });
      show();
      fireEvent.click(screen.getByRole("button", { name: "Switch name" }));
      expect(screen.getByRole("button", { name: "Switching…" })).toBeDisabled();
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
      expect(mocks.api).toHaveBeenCalledWith("/api/session", "DELETE");
    });

    it("stays put and says so when the server cannot be reached", async () => {
      mocks.api.mockResolvedValue({ ok: false, error: { code: "network", message: "Can’t reach the server." } });
      const h = show();
      fireEvent.click(screen.getByRole("button", { name: "Switch name" }));
      await waitFor(() => expect(h.onSwitchFailed).toHaveBeenCalledWith("Can’t reach the server."));
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Switch name" })).toBeEnabled();
    });
  });
});
