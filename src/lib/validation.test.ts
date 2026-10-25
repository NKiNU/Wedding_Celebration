import { describe, expect, test } from "vitest";
import { validEnv as valid } from "../../tests/fixtures/env";
import { activateGuestBody, createGuestBody, parseEnv } from "./validation";

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

describe("createGuestBody", () => {
  test("normalizes the name", () => {
    expect(createGuestBody.parse({ name: "  Aina   from Kajang " })).toEqual({
      name: "Aina from Kajang",
    });
  });

  test("explains a name that is too short or too long", () => {
    expect(createGuestBody.safeParse({ name: " A " }).error?.issues[0].message).toBe(
      "Please enter at least 2 characters.",
    );
    expect(createGuestBody.safeParse({ name: "a".repeat(25) }).error?.issues[0].message).toBe(
      "Names can be up to 24 characters.",
    );
  });

  test("rejects a body that is not an object with a string name", () => {
    expect(createGuestBody.safeParse(null).success).toBe(false);
    expect(createGuestBody.safeParse({ name: 7 }).success).toBe(false);
  });

  test("ignores fields the client has no business sending", () => {
    expect(createGuestBody.parse({ name: "Ali", guestId: "x", token_hash: "y" })).toEqual({
      name: "Ali",
    });
  });
});

describe("activateGuestBody", () => {
  test("needs a uuid guest id", () => {
    const id = "a0000000-0000-4000-8000-000000000003";
    expect(activateGuestBody.parse({ guestId: id })).toEqual({ guestId: id });
    expect(activateGuestBody.safeParse({ guestId: "nope" }).success).toBe(false);
    expect(activateGuestBody.safeParse({}).success).toBe(false);
  });
});
