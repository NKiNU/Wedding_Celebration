import { describe, expect, it } from "vitest";
import { MAX_NAMES_PER_PHONE } from "./limits";
import { addToken } from "./tokens";

describe("addToken", () => {
  it("appends a new token without touching the original list", () => {
    const before = ["a", "b"];
    expect(addToken(before, "c")).toEqual(["a", "b", "c"]);
    expect(before).toEqual(["a", "b"]);
  });

  it("drops the oldest token once the phone holds the maximum", () => {
    const full = ["1", "2", "3", "4", "5"];
    expect(full).toHaveLength(MAX_NAMES_PER_PHONE);
    expect(addToken(full, "6")).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("moves a repeated token to the newest slot instead of duplicating it", () => {
    expect(addToken(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });
});
