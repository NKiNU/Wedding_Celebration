import { afterEach, describe, expect, it, vi } from "vitest";
import { cameFromWall, markFromWall } from "./fromWall";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("fromWall", () => {
  it("remembers the post a card tap opened, and only that post", () => {
    expect(cameFromWall("p1")).toBe(false);
    markFromWall("p1");
    expect(cameFromWall("p1")).toBe(true);
    expect(cameFromWall("p2")).toBe(false);
  });

  it("treats blocked storage as 'not from the wall'", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    vi.stubGlobal("sessionStorage", blocked);
    expect(() => markFromWall("p1")).not.toThrow();
    expect(cameFromWall("p1")).toBe(false);
  });
});
