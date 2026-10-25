import { describe, expect, it } from "vitest";
import { BYTES_PER_HOUR, MB, POSTS_PER_HOUR } from "./limits";
import { intentUsage, rateLimitProblem } from "./rateLimit";

describe("intentUsage", () => {
  it("counts one post per intent and every declared byte", () => {
    expect(intentUsage([{ files: [{ bytes: 5 }, { bytes: 1 }] }, { files: [{ bytes: 4 }] }])).toEqual({
      posts: 2,
      bytes: 10,
    });
    expect(intentUsage([])).toEqual({ posts: 0, bytes: 0 });
  });
});

describe("rateLimitProblem", () => {
  it("lets the 30th post of the hour through and stops the 31st", () => {
    expect(rateLimitProblem({ posts: POSTS_PER_HOUR - 1, bytes: 0 }, { posts: 1, bytes: 0 })).toBeNull();
    expect(rateLimitProblem({ posts: POSTS_PER_HOUR, bytes: 0 }, { posts: 1, bytes: 0 })).toMatch(/try again/);
  });
  it("allows exactly 200 MB and stops one byte more", () => {
    const used = { posts: 0, bytes: BYTES_PER_HOUR - 10 * MB };
    expect(rateLimitProblem(used, { posts: 1, bytes: 10 * MB })).toBeNull();
    expect(rateLimitProblem(used, { posts: 1, bytes: 10 * MB + 1 })).toMatch(/try again/);
  });
});
