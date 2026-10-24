import { afterEach, describe, expect, test, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env()", () => {
  test("throws when variables are missing, then caches a valid parse", async () => {
    // Blank them first so a developer shell with real vars exported cannot mask the failure.
    for (const k of Object.keys(validEnv)) vi.stubEnv(k, "");
    const { env } = await import("./env");
    expect(() => env()).toThrow(/Invalid environment/);

    for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
    const first = env();
    expect(first.EVENT_SLUG).toBe("demo");
    expect(env()).toBe(first);
  });
});
