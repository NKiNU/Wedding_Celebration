import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { image, wallPost, wishPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({
  useWall: vi.fn(),
  refresh: vi.fn(),
  drop: vi.fn(),
  api: vi.fn(),
  consumeWelcome: vi.fn(),
  consumeFlash: vi.fn(),
  observe: vi.fn(),
  disconnect: vi.fn(),
  trigger: null as null | ((visible: boolean) => void),
}));
vi.mock("./useWall", () => ({ useWall: mocks.useWall }));
// The drawers have their own tests: here they only show that Wall opened them and report a post.
vi.mock("@/components/drawers/PhotoDrawer", () => ({
  PhotoDrawer: (p: { open: boolean; onPosted: (t: string) => void }) =>
    p.open && <button onClick={() => p.onPosted("album")}>photo drawer</button>,
}));
vi.mock("@/components/drawers/VideoDrawer", () => ({
  VideoDrawer: (p: { open: boolean; onPosted: (t: string) => void }) =>
    p.open && <button onClick={() => p.onPosted("video")}>video drawer</button>,
}));
vi.mock("@/components/drawers/WishDrawer", () => ({
  WishDrawer: (p: { open: boolean; me: string; onPosted: () => void }) =>
    p.open && <button onClick={p.onPosted}>wish drawer for {p.me}</button>,
}));
vi.mock("@/lib/welcome", () => ({ consumeWelcome: mocks.consumeWelcome }));
vi.mock("@/lib/flash", () => ({ consumeFlash: mocks.consumeFlash }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

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
  refresh: mocks.refresh,
  drop: mocks.drop,
  ...over,
});

/** The post cards only: the share menu is a list too. */
const cards = () => within(screen.getByRole("main")).getAllByRole("listitem");
const main = () => within(screen.getByRole("main"));
/** The toast's visible copy (a live region repeats it for screen readers). */
const toast = (text: string | RegExp) => screen.getByText(text, { selector: "p" });
const noToast = (text: string | RegExp) => expect(screen.queryByText(text, { selector: "p" })).not.toBeInTheDocument();

const show = (openWish?: typeof wish) =>
  render(
    <Wall
      openWish={openWish}
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
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.useWall.mockReturnValue(wallState());
  mocks.consumeWelcome.mockReturnValue(false);
  mocks.consumeFlash.mockReturnValue(null);
  mocks.api.mockImplementation(async (path: string, method: string) =>
    path === "/api/me/posts" ? { ok: true, data: [album] } : method === "DELETE" ? { ok: true, data: null } : { ok: false, error: { code: "x", message: "x" } },
  );
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
    expect(cards()).toHaveLength(3);
    expect(main().getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/3 memories shared/)).toBeInTheDocument();
  });

  it("opens the wish a shared link points to, even when it is not on the loaded page", () => {
    const old = wishPost({ id: "00000000-0000-4000-8000-000000000a09", wishText: "From the old days", author: "Pak Long", guestId: "other" });
    show(old);
    expect(within(screen.getByRole("dialog")).getByText("From the old days")).toBeInTheDocument();
  });

  it("filters by type with the pills", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Videos 1" }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Video by Iman" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Photos 1" }));
    expect(screen.getByRole("link", { name: "Album by Nazrul, 3 photos" })).toBeInTheDocument();
  });

  it("opens a wish in the drawer from its card and from the ticker", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /Latest wishes/ }));
    expect(screen.getByRole("dialog", { name: "Wish" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Wish" })).not.toBeInTheDocument();
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
    expect(toast("Welcome, Aina! Tap + to share.")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2600));
    noToast("Welcome, Aina! Tap + to share.");
  });

  it("shows a message left by the screen before, in place of the greeting", () => {
    mocks.consumeFlash.mockReturnValue("Post deleted");
    mocks.consumeWelcome.mockReturnValue(true);
    show();
    act(() => void vi.advanceTimersByTime(1));
    expect(toast("Post deleted")).toBeInTheDocument();
    noToast(/Welcome, Aina/);
  });

  it("advances relative times by the server's clock, whatever the phone's clock says", () => {
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z")); // a phone years off
    show();
    expect(screen.getAllByText("5 min ago").length).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText("6 min ago").length).toBeGreaterThan(0);
    expect(screen.queryByText("5 min ago")).not.toBeInTheDocument();
  });

  describe("sharing", () => {
    const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Share a memory" }));

    it("opens the menu from the + button and the drawer for the picked kind", () => {
      show();
      openMenu();
      expect(screen.getByRole("button", { name: "Close share menu" })).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(screen.getByRole("button", { name: /Write to the couple/ }));
      expect(screen.getByRole("button", { name: "wish drawer for Aina" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share a memory" })).toBeInTheDocument();
    });

    it.each([
      [/1 photo or an album/, "photo drawer"],
      [/Up to 60 seconds/, "video drawer"],
    ])("opens the drawer for %s", (item, drawer) => {
      show();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: item }));
      expect(screen.getByRole("button", { name: drawer })).toBeInTheDocument();
    });

    it("gives focus back to the + button when the menu closes without a pick", () => {
      show();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
      expect(screen.getByRole("button", { name: "Share a memory" })).toHaveFocus();
    });

    it("closes the menu on a second tap of the button", () => {
      show();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Close share menu" }));
      expect(screen.getByRole("button", { name: "Share a memory" })).toHaveAttribute("aria-expanded", "false");
    });

    it("after a post: closes the drawer, thanks the guest, scrolls up and fetches the wall now", () => {
      show();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /1 photo or an album/ }));
      fireEvent.click(screen.getByRole("button", { name: "photo drawer" }));
      expect(screen.queryByRole("button", { name: "photo drawer" })).not.toBeInTheDocument();
      expect(toast("Shared! Your photos are on the wall as an album.")).toBeInTheDocument();
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
      expect(mocks.refresh).toHaveBeenCalledOnce();
    });

    it("shows a post that the current filter would hide by switching back to All", () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "Videos 1" }));
      expect(cards()).toHaveLength(1);
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /Write to the couple/ }));
      fireEvent.click(screen.getByRole("button", { name: /wish drawer/ }));
      expect(cards()).toHaveLength(3);
      expect(toast("Your wish has been sent to the couple.")).toBeInTheDocument();
    });

    it("keeps the filter when the new post matches it", () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "Videos 1" }));
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /Up to 60 seconds/ }));
      fireEvent.click(screen.getByRole("button", { name: "video drawer" }));
      expect(cards()).toHaveLength(1);
    });

    it("lets the empty state start sharing", () => {
      mocks.useWall.mockReturnValue(wallState({ posts: [album], counts: { ...counts, wishes: 0 } }));
      show();
      fireEvent.click(screen.getByRole("button", { name: "Wishes 0" }));
      fireEvent.click(screen.getByRole("button", { name: "Write a wish" }));
      expect(screen.getByRole("button", { name: "wish drawer for Aina" })).toBeInTheDocument();
    });
  });
  describe("your posts and delete", () => {
    const openMe = () => fireEvent.click(screen.getByRole("button", { name: "Your name and posts, Aina" }));
    const confirmDelete = () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    const mine = wishPost({ id: "00000000-0000-4000-8000-000000000a04", wishText: "Mine!", author: "Aina", guestId: ME.guestId });

    it("opens the Me drawer from the name chip and lists the guest's own posts", async () => {
      vi.useRealTimers();
      show();
      openMe();
      expect(await screen.findByRole("heading", { name: "Your posts (1)" })).toBeInTheDocument();
      expect(mocks.api).toHaveBeenCalledWith("/api/me/posts", "GET");
      expect(screen.getByRole("link", { name: /Album · 3 photos/ })).toHaveAttribute("href", `/p/${album.id}`);
    });

    it("deletes a post from the Me drawer after confirming, and tells the wall", async () => {
      vi.useRealTimers();
      show();
      openMe();
      fireEvent.click(await screen.findByRole("button", { name: "Delete album" }));
      expect(screen.getByRole("alertdialog", { name: "Delete this album?" })).toBeInTheDocument();
      expect(mocks.api).not.toHaveBeenCalledWith(expect.stringContaining("/api/posts/"), "DELETE");

      confirmDelete();
      await waitFor(() => expect(mocks.drop).toHaveBeenCalledWith(album.id));
      expect(mocks.api).toHaveBeenCalledWith(`/api/posts/${album.id}`, "DELETE");
      expect(toast("Post deleted")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
    });

    it("keeps the post when the guest chooses Keep it", async () => {
      vi.useRealTimers();
      show();
      openMe();
      fireEvent.click(await screen.findByRole("button", { name: "Delete album" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
      expect(mocks.drop).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Delete album" })).toBeInTheDocument();
    });

    it("lets the author delete their own wish from its drawer, which then closes", async () => {
      vi.useRealTimers();
      mocks.useWall.mockReturnValue(wallState({ posts: [mine, album], counts: { ...counts, all: 2 } }));
      show();
      fireEvent.click(main().getByRole("button", { name: /Mine!/ }));
      fireEvent.click(screen.getByRole("button", { name: "Delete my wish" }));
      expect(screen.getByRole("alertdialog", { name: "Delete this wish?" })).toBeInTheDocument();

      confirmDelete();
      await waitFor(() => expect(mocks.drop).toHaveBeenCalledWith(mine.id));
      expect(screen.queryByRole("button", { name: "Delete my wish" })).not.toBeInTheDocument();
    });

    it("offers no delete on someone else's wish", () => {
      show();
      fireEvent.click(main().getByRole("button", { name: /Congratulations!/ }));
      expect(screen.queryByRole("button", { name: "Delete my wish" })).not.toBeInTheDocument();
    });

    it("opens one of the guest's wishes from the Me drawer in the wish drawer", async () => {
      vi.useRealTimers();
      mocks.api.mockImplementation(async (path: string) => (path === "/api/me/posts" ? { ok: true, data: [mine] } : { ok: true, data: null }));
      show();
      openMe();
      fireEvent.click(await within(screen.getByRole("dialog", { name: "You" })).findByRole("button", { name: /^Wish/ }));
      expect(screen.getByRole("dialog", { name: "Wish" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete my wish" })).toBeInTheDocument();
    });

    it("sends a guest with nothing yet from the Me drawer to the share menu", async () => {
      vi.useRealTimers();
      mocks.api.mockImplementation(async () => ({ ok: true, data: [] }));
      show();
      openMe();
      fireEvent.click(await screen.findByRole("button", { name: "Share something" }));
      expect(screen.getByRole("button", { name: "Close share menu" })).toHaveAttribute("aria-expanded", "true");
    });

    it("says so when Switch name cannot reach the server", async () => {
      vi.useRealTimers();
      mocks.api.mockImplementation(async (path: string, method: string) =>
        method === "DELETE" ? { ok: false, error: { code: "network", message: "Can’t reach the server." } } : { ok: true, data: [] },
      );
      show();
      openMe();
      fireEvent.click(await screen.findByRole("button", { name: "Switch name" }));
      expect(await screen.findByText("Can’t reach the server.", { selector: "p" })).toBeInTheDocument();
    });
  });
});
