import { describe, expect, test } from "vitest";
import { validEnv as valid } from "../../tests/fixtures/env";
import {
  activateGuestBody,
  createGuestBody,
  createPostBody,
  createUploadBody,
  parseEnv,
  postIdParam,
  storedFiles,
} from "./validation";

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

const ID = "b0000000-0000-4000-8000-000000000001";
const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe("createPostBody", () => {
  test("trims a wish and ignores a client-sent type", () => {
    const r = createPostBody.parse({ wishText: "  Congratulations!  ", type: "photo" });
    expect(r).toEqual({ wishText: "Congratulations!", caption: null });
  });
  test("rejects wishes of 2 and 301 characters with a clear message", () => {
    expect(msg(createPostBody.safeParse({ wishText: "ab" }))).toMatch(/at least 3/);
    expect(msg(createPostBody.safeParse({ wishText: "a".repeat(301) }))).toMatch(/up to 300/);
    expect(createPostBody.safeParse({ wishText: "a".repeat(300) }).success).toBe(true);
  });
  test("caps captions at 120 and turns an empty one into null", () => {
    expect(msg(createPostBody.safeParse({ postId: ID, caption: "a".repeat(121) }))).toMatch(/up to 120/);
    expect(createPostBody.parse({ postId: ID, caption: "   " }).caption).toBeNull();
    expect(createPostBody.parse({ postId: ID, caption: " Akad " }).caption).toBe("Akad");
  });
  test("needs exactly one of postId and wishText", () => {
    expect(createPostBody.safeParse({}).success).toBe(false);
    expect(createPostBody.safeParse({ postId: ID, wishText: "Selamat!" }).success).toBe(false);
    expect(createPostBody.safeParse({ postId: "nope" }).success).toBe(false);
  });
});

describe("createUploadBody", () => {
  const file = (role: string, position: number, mime = "image/jpeg", bytes = 1000) => ({ role, position, mime, bytes });
  test("accepts a photo with its thumb", () => {
    expect(createUploadBody.safeParse({ files: [file("main", 0), file("thumb", 0)] }).success).toBe(true);
  });
  test("reports the domain problem for a bad set of files", () => {
    expect(msg(createUploadBody.safeParse({ files: [file("main", 0)] }))).toMatch(/thumbnail/);
    expect(createUploadBody.safeParse({ files: [] }).success).toBe(false);
  });
  test("rejects non-integer or oversized sizes", () => {
    expect(createUploadBody.safeParse({ files: [file("main", 0, "image/jpeg", 1.5)] }).success).toBe(false);
    expect(createUploadBody.safeParse({ files: [file("main", 0, "image/jpeg", 2 ** 40)] }).success).toBe(false);
  });
});

test("storedFiles needs a key on every file", () => {
  expect(storedFiles.safeParse([{ role: "main", position: 0, mime: "image/jpeg", bytes: 1 }]).success).toBe(false);
  expect(storedFiles.safeParse([{ role: "main", position: 0, mime: "image/jpeg", bytes: 1, key: "k" }]).success).toBe(true);
});

test("postIdParam accepts only a uuid", () => {
  expect(postIdParam.safeParse(ID).success).toBe(true);
  expect(postIdParam.safeParse("../x").success).toBe(false);
});
