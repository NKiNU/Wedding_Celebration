import { describe, expect, test } from "vitest";
import { validEnv as valid } from "../../tests/fixtures/env";
import { parseEnv } from "./validation";

describe("parseEnv", () => {
  test("returns typed config when every variable is present", () => {
    expect(parseEnv(valid).EVENT_SLUG).toBe("demo");
  });

  test("throws naming the missing variable", () => {
    const rest = Object.fromEntries(Object.entries(valid).filter(([k]) => k !== "ADMIN_PASSCODE"));
    expect(() => parseEnv(rest)).toThrow(/ADMIN_PASSCODE/);
  });

  test("rejects an admin passcode shorter than 8 characters", () => {
    expect(() => parseEnv({ ...valid, ADMIN_PASSCODE: "1234567" })).toThrow(/ADMIN_PASSCODE/);
  });

  test("rejects a pepper shorter than 32 characters", () => {
    expect(() => parseEnv({ ...valid, DEVICE_TOKEN_PEPPER: "short" })).toThrow(
      /DEVICE_TOKEN_PEPPER/,
    );
  });

  test("rejects a media base URL that is not a URL", () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_MEDIA_BASE_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_MEDIA_BASE_URL/,
    );
  });
});
