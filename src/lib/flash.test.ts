import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeFlash, flash } from "./flash";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("flash message", () => {
  it("is shown once: the message is cleared when read", () => {
    expect(consumeFlash()).toBeNull();
    flash("Post deleted");
    expect(consumeFlash()).toBe("Post deleted");
    expect(consumeFlash()).toBeNull();
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => flash("x")).not.toThrow();
    expect(consumeFlash()).toBeNull();
  });
});
