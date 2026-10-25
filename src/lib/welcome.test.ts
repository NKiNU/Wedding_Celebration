import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeWelcome, flagWelcome } from "./welcome";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("welcome flag", () => {
  it("greets once: the flag is cleared when read", () => {
    expect(consumeWelcome()).toBe(false);
    flagWelcome();
    expect(consumeWelcome()).toBe(true);
    expect(consumeWelcome()).toBe(false);
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => flagWelcome()).not.toThrow();
    expect(consumeWelcome()).toBe(false);
  });
});
