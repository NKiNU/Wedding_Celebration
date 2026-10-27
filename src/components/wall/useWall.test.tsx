import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WallEvents } from "@/lib/realtime";
import type { WallCounts, WallPost } from "@/lib/domain/posts";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

import { useWall } from "./useWall";

const at = (n: number, over: Partial<WallPost> = {}): WallPost => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  type: "photo",
  caption: null,
  wishText: null,
  createdAt: `2026-10-25T10:${String(n).padStart(2, "0")}:00+00:00`,
  guestId: "g",
  author: "Ali",
  media: [],
  ...over,
});
const counts = (all: number): WallCounts => ({ all, photos: all, videos: 0, wishes: 0 });
const ok = (data: unknown) => ({ ok: true, data });

let events: WallEvents;
const stop = vi.fn();
const subscribe = vi.fn((_id: string, e: WallEvents) => {
  events = e;
  return stop;
});

const setup = (posts: WallPost[], nextCursor: string | null = null) =>
  renderHook(() => useWall({ eventId: "e1", posts, nextCursor, counts: counts(posts.length) }, subscribe));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.api.mockReset();
  stop.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("refresh", () => {
  it("fetches page 1 right away, without the debounce, and shows the new post and counts", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(3), at(2)], nextCursor: null, counts: counts(2) }));
    const { result } = setup([at(2)]);

    await act(() => result.current.refresh());

    expect(mocks.api).toHaveBeenCalledWith("/api/posts", "GET");
    expect(result.current.posts.map((p) => p.id)).toEqual([at(3).id, at(2).id]);
    expect(result.current.counts.all).toBe(2);
  });

  it("replaces a pending debounced refresh instead of fetching twice", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(2)], nextCursor: null, counts: counts(1) }));
    const { result } = setup([at(2)]);
    act(() => events.onChange());

    await act(() => result.current.refresh());
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
});

describe("wishes for the ticker", () => {
  const wish = (n: number) => at(n, { type: "wish", wishText: `Wish ${n}` });
  const setupWithWishes = () =>
    renderHook(
      () => useWall({ eventId: "e1", posts: [at(9)], nextCursor: null, counts: counts(1), wishes: [wish(1)] }, subscribe),
    );

  it("starts from the wishes the server sent, not from the loaded posts", () => {
    const { result } = setupWithWishes();
    expect(result.current.wishes.map((w) => w.id)).toEqual([wish(1).id]);
  });

  it("takes the newest wishes from the first page, and keeps the old ones when a response has none", async () => {
    mocks.api.mockResolvedValueOnce(ok({ posts: [at(9)], nextCursor: null, counts: counts(1), wishes: [wish(3), wish(2)] }));
    const { result } = setupWithWishes();
    await act(() => result.current.refresh());
    expect(result.current.wishes.map((w) => w.id)).toEqual([wish(3).id, wish(2).id]);

    mocks.api.mockResolvedValueOnce(ok({ posts: [at(9)], nextCursor: null, counts: null }));
    await act(() => result.current.refresh());
    expect(result.current.wishes).toHaveLength(2);
  });

  it("drops a wish that was deleted or hidden", () => {
    const { result } = setupWithWishes();
    act(() => result.current.drop(wish(1).id));
    expect(result.current.wishes).toEqual([]);
  });
});

describe("loadMore", () => {
  it("appends the next page using the cursor and takes the new cursor", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(1)], nextCursor: null, counts: null }));
    const { result } = setup([at(3), at(2)], "c1");

    await act(() => result.current.loadMore());

    expect(mocks.api).toHaveBeenCalledWith("/api/posts?cursor=c1", "GET");
    expect(result.current.posts.map((p) => p.id)).toEqual([at(3).id, at(2).id, at(1).id]);
    expect(result.current.nextCursor).toBeNull();
  });

  it("does nothing without a cursor, and never runs two requests at once", async () => {
    const none = setup([at(1)], null);
    await act(() => none.result.current.loadMore());
    expect(mocks.api).not.toHaveBeenCalled();

    let finish!: (v: unknown) => void;
    mocks.api.mockReturnValue(new Promise((r) => (finish = r)));
    const { result } = setup([at(2)], "c");
    act(() => void result.current.loadMore());
    act(() => void result.current.loadMore());
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    await act(async () => finish(ok({ posts: [], nextCursor: null, counts: null })));
    expect(result.current.loading).toBe(false);
  });

  it("keeps the wall and offers a retry when a page fails", async () => {
    mocks.api.mockResolvedValueOnce({ ok: false, error: { code: "network", message: "Can’t reach the server." } });
    const { result } = setup([at(2)], "c");
    await act(() => result.current.loadMore());
    expect(result.current.loadError).toBe("Can’t reach the server.");
    expect(result.current.posts).toHaveLength(1);

    mocks.api.mockResolvedValueOnce(ok({ posts: [at(1)], nextCursor: null, counts: null }));
    await act(() => result.current.loadMore());
    expect(result.current.loadError).toBeNull();
    expect(result.current.posts).toHaveLength(2);
  });
});

describe("realtime", () => {
  const settle = () => act(() => vi.advanceTimersByTimeAsync(600));

  it("subscribes for this event and unsubscribes on unmount", () => {
    const { unmount } = setup([at(1)]);
    expect(subscribe).toHaveBeenCalledWith("e1", expect.any(Object));
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("coalesces a burst of changes into one refetch of page 1, with counts", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(4), at(3)], nextCursor: "n", counts: counts(2) }));
    const { result } = setup([at(3)]);

    act(() => {
      events.onChange();
      events.onChange();
      events.onChange();
    });
    await settle();

    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith("/api/posts", "GET");
    expect(result.current.posts.map((p) => p.id)).toEqual([at(4).id, at(3).id]);
    expect(result.current.counts.all).toBe(2);
  });

  it("drops a deleted or hidden post at once and refreshes the counts", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(1)], nextCursor: null, counts: counts(1) }));
    const { result } = setup([at(2), at(1)]);

    act(() => events.onRemove(at(2).id));
    expect(result.current.posts.map((p) => p.id)).toEqual([at(1).id]);
    await settle();
    expect(result.current.counts.all).toBe(1);
  });

  it("drops a post the guest deleted here, and a late page cannot bring it back", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(1)], nextCursor: null, counts: counts(1) }));
    const { result } = setup([at(2), at(1)]);

    act(() => result.current.drop(at(2).id));
    expect(result.current.posts.map((p) => p.id)).toEqual([at(1).id]);
    await settle();
    expect(result.current.counts.all).toBe(1);
  });

  it("refetches on the first connection too, and drops a post the stale page still showed", async () => {
    // Back from the viewer the client router can serve a page rendered before the post was deleted.
    mocks.api.mockResolvedValue(ok({ posts: [at(1)], nextCursor: null, counts: counts(1) }));
    const { result } = setup([at(2), at(1)]);

    act(() => events.onConnected());
    await settle();

    expect(mocks.api).toHaveBeenCalledOnce();
    expect(result.current.posts.map((p) => p.id)).toEqual([at(1).id]);
    expect(result.current.counts.all).toBe(1);
  });

  it("restarts from page 1 after a reconnect, so a hide missed on a deep page is gone", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(30), at(29)], nextCursor: "fresh", counts: counts(30) }));
    const { result } = setup([at(30), at(29), at(1)], "old");

    act(() => events.onConnected());
    act(() => events.onConnected());
    await settle();

    expect(result.current.posts.map((p) => p.id)).toEqual([at(30).id, at(29).id]);
    expect(result.current.nextCursor).toBe("fresh");
  });

  it("keeps the loaded cursor when a plain change is contiguous, and survives a failed refetch", async () => {
    mocks.api.mockResolvedValueOnce(ok({ posts: [at(2), at(1)], nextCursor: "fresh", counts: null }));
    const { result } = setup([at(1)], "old");
    act(() => events.onChange());
    await settle();
    expect(result.current.nextCursor).toBe("old");

    mocks.api.mockResolvedValueOnce({ ok: false, error: { code: "network", message: "x" } });
    act(() => events.onChange());
    await settle();
    expect(result.current.posts).toHaveLength(2);
  });

  it("clears a stale oldest post when the fresh page is the whole wall", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(5)], nextCursor: null, counts: counts(1) }));
    const { result } = setup([at(5), at(1)]);
    act(() => events.onChange());
    await settle();
    expect(result.current.posts.map((p) => p.id)).toEqual([at(5).id]);
  });

  it("refetches softly after a short absence and restarts after a long one", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [at(3), at(2)], nextCursor: "fresh", counts: counts(3) }));
    const { result } = setup([at(3), at(2), at(1)], "old");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const flip = (state: "hidden" | "visible") => {
      visibility.mockReturnValue(state);
      act(() => void document.dispatchEvent(new Event("visibilitychange")));
    };

    flip("visible"); // never was hidden: nothing to catch up on
    await settle();
    expect(mocks.api).not.toHaveBeenCalled();

    flip("hidden");
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    flip("visible");
    await settle();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(result.current.posts).toHaveLength(3); // soft: the deep page is kept
    expect(result.current.nextCursor).toBe("old");

    flip("hidden");
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    flip("visible");
    await settle();
    expect(result.current.posts).toHaveLength(2); // restart: back to page 1
    expect(result.current.nextCursor).toBe("fresh");
    visibility.mockRestore();
  });
});

describe("races", () => {
  it("discards an older page that was in flight when the list restarted", async () => {
    let finishPage!: (v: unknown) => void;
    mocks.api.mockImplementationOnce(() => new Promise((r) => (finishPage = r)));
    const { result } = setup([at(3), at(1)], "old");

    act(() => void result.current.loadMore());
    mocks.api.mockResolvedValueOnce(ok({ posts: [at(9), at(8)], nextCursor: "fresh", counts: counts(9) }));
    act(() => events.onConnected());
    act(() => events.onConnected());
    await act(() => vi.advanceTimersByTimeAsync(600));
    await act(async () => finishPage(ok({ posts: [at(0)], nextCursor: null, counts: null })));

    expect(result.current.posts.map((p) => p.id)).toEqual([at(9).id, at(8).id]);
    expect(result.current.nextCursor).toBe("fresh");
    expect(result.current.loading).toBe(false);
  });

  it("does not revive a post that was hidden while its page was in flight", async () => {
    let finishPage!: (v: unknown) => void;
    mocks.api.mockImplementationOnce(() => new Promise((r) => (finishPage = r)));
    const { result } = setup([at(3)], "old");

    act(() => void result.current.loadMore());
    act(() => events.onRemove(at(1).id));
    await act(async () => finishPage(ok({ posts: [at(2), at(1)], nextCursor: null, counts: null })));

    expect(result.current.posts.map((p) => p.id)).toEqual([at(3).id, at(2).id]);
  });
});
