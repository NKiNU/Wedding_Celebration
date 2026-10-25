import { describe, expect, it } from "vitest";
import {
  coverOf,
  decodeCursor,
  encodeCursor,
  formatDuration,
  matchesFilter,
  mergePosts,
  reconcileWall,
  relativeTime,
  type WallPost,
} from "./posts";

const post = (over: Partial<WallPost> = {}): WallPost => ({
  id: "b0000000-0000-4000-8000-000000000001",
  type: "photo",
  caption: null,
  wishText: null,
  createdAt: "2026-10-25T10:00:00.000000+00:00",
  guestId: "a0000000-0000-4000-8000-000000000001",
  author: "Nazrul",
  media: [{ kind: "image", url: "u", thumbUrl: "t", posterUrl: null, durationS: null }],
  ...over,
});

describe("matchesFilter", () => {
  it("All shows everything and Photos includes albums", () => {
    expect(matchesFilter(post({ type: "wish" }), "all")).toBe(true);
    expect(matchesFilter(post({ type: "album" }), "photos")).toBe(true);
    expect(matchesFilter(post({ type: "photo" }), "photos")).toBe(true);
    expect(matchesFilter(post({ type: "video" }), "photos")).toBe(false);
    expect(matchesFilter(post({ type: "video" }), "videos")).toBe(true);
    expect(matchesFilter(post({ type: "wish" }), "wishes")).toBe(true);
    expect(matchesFilter(post({ type: "wish" }), "videos")).toBe(false);
  });
});

describe("mergePosts", () => {
  const a = post({ id: "00000000-0000-4000-8000-00000000000a", createdAt: "2026-10-25T10:05:00+00:00" });
  const b = post({ id: "00000000-0000-4000-8000-00000000000b", createdAt: "2026-10-25T10:00:00+00:00" });
  const c = post({ id: "00000000-0000-4000-8000-00000000000c", createdAt: "2026-10-25T10:00:00+00:00" });

  it("orders newest first and breaks created_at ties by id, like the keyset index", () => {
    expect(mergePosts([b], [a, c]).map((p) => p.id)).toEqual([a.id, c.id, b.id]);
  });

  it("keeps the later copy of a post that appears twice, without mutating the inputs", () => {
    const first = [b];
    const edited = { ...b, caption: "edited" };
    const merged = mergePosts(first, [edited]);
    expect(merged).toEqual([edited]);
    expect(first[0]!.caption).toBeNull();
  });

  it("compares instants, not strings, so different offsets still order correctly", () => {
    const early = post({ id: "00000000-0000-4000-8000-0000000000e1", createdAt: "2026-10-25T10:00:00+08:00" });
    const late = post({ id: "00000000-0000-4000-8000-0000000000e2", createdAt: "2026-10-25T03:00:00+00:00" });
    expect(mergePosts([early], [late]).map((p) => p.id)).toEqual([late.id, early.id]);
  });
});

describe("cursor", () => {
  const stamp = "2026-10-25T10:00:00.123456+00:00";
  const id = "b0000000-0000-4000-8000-000000000001";

  it("round-trips, keeping microseconds as the database returned them", () => {
    expect(decodeCursor(encodeCursor(stamp, id))).toEqual({ createdAt: stamp, id });
  });

  it.each(["", "not-base64!", encodeCursor("yesterday", id), encodeCursor(stamp, "nope"), "e30"])(
    "rejects %j",
    (bad) => {
      expect(decodeCursor(bad)).toBeNull();
    },
  );

  it("rejects characters that could break out of a PostgREST filter", () => {
    expect(decodeCursor(encodeCursor("2026-10-25T10:00:00+00:00),id.gt.0", id))).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [42, "0:42"],
    [60, "1:00"],
    [75.9, "1:15"],
    [null, "0:00"],
    [-3, "0:00"],
  ])("%j -> %s", (seconds, label) => {
    expect(formatDuration(seconds)).toBe(label);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;

  it.each([
    [10_000, "Just now"],
    [5 * MIN, "5 min ago"],
    [59 * MIN, "59 min ago"],
    [2 * 60 * MIN, "2 hr ago"],
    [3 * 24 * 60 * MIN, "3 days ago"],
  ])("%j ms ago -> %s", (ms, label) => {
    expect(relativeTime(ago(ms), now)).toBe(label);
  });

  it("falls back to a date after a week, and treats a future timestamp as just now", () => {
    expect(relativeTime(ago(10 * 24 * 60 * MIN), now)).toBe("Oct 15");
    expect(relativeTime(new Date(now.getTime() + 5 * MIN).toISOString(), now)).toBe("Just now");
  });
});

describe("coverOf", () => {
  it("uses the thumbnail for photos and albums and the poster for videos", () => {
    expect(coverOf(post())).toBe("t");
    const video = post({
      type: "video",
      media: [{ kind: "video", url: "v", thumbUrl: null, posterUrl: "p", durationS: 42 }],
    });
    expect(coverOf(video)).toBe("p");
  });

  it("falls back to the main file, or null when there is no media", () => {
    const bare = post({ media: [{ kind: "image", url: "u", thumbUrl: null, posterUrl: null, durationS: null }] });
    expect(coverOf(bare)).toBe("u");
    expect(coverOf(post({ type: "wish", media: [] }))).toBeNull();
  });
});

describe("reconcileWall", () => {
  const at = (n: number) =>
    post({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, createdAt: `2026-10-25T10:${String(n).padStart(2, "0")}:00+00:00` });
  const ids = (list: WallPost[]) => list.map((p) => p.id);

  it("adds new posts and keeps older loaded pages", () => {
    const { posts, restart } = reconcileWall([at(5), at(4), at(1)], [at(6), at(5), at(4)]);
    expect(ids(posts)).toEqual(ids([at(6), at(5), at(4), at(1)]));
    expect(restart).toBe(false);
  });

  it("drops a post the fresh page should show but does not (hidden or deleted)", () => {
    const { posts } = reconcileWall([at(5), at(4), at(3), at(1)], [at(5), at(3), at(2)]);
    expect(ids(posts)).toEqual(ids([at(5), at(3), at(2), at(1)]));
  });

  it("restarts from the fresh page when a whole page arrived while away", () => {
    const { posts, restart } = reconcileWall([at(1)], [at(9), at(8), at(7)]);
    expect(ids(posts)).toEqual(ids([at(9), at(8), at(7)]));
    expect(restart).toBe(true);
  });

  it("starts from nothing, and empties when the wall was cleared", () => {
    expect(reconcileWall([], [at(2)])).toEqual({ posts: [at(2)], restart: true });
    expect(reconcileWall([at(2)], [])).toEqual({ posts: [], restart: false });
  });

  it("drops the oldest post too when the fresh page is the whole wall", () => {
    const { posts, restart } = reconcileWall([at(5), at(1)], [at(5)], true);
    expect(ids(posts)).toEqual(ids([at(5)]));
    expect(restart).toBe(true);
  });
});
