import { describe, expect, test } from "vitest";
import {
  BYTES_PER_HOUR,
  MAX_PHOTOS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MB,
  PAGE_SIZE,
  POSTS_PER_HOUR,
} from "./limits";

describe("limits", () => {
  test("match the rules in CLAUDE.md", () => {
    expect(MAX_PHOTOS).toBe(10);
    expect(MAX_VIDEO_BYTES).toBe(80 * MB);
    expect(MAX_VIDEO_SECONDS).toBe(30);
    expect(POSTS_PER_HOUR).toBe(30);
    expect(BYTES_PER_HOUR).toBe(200 * MB);
    expect(PAGE_SIZE).toBe(24);
  });

  test("MB is a binary megabyte", () => {
    expect(MB).toBe(1024 * 1024);
  });
});
