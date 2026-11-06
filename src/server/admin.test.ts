// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeR2 } from "../../tests/fixtures/r2";
import { fakeDb, type DbResult } from "../../tests/fixtures/supabase";
import { MAX_PINS } from "@/lib/domain/limits";
import { encodeCursor } from "@/lib/domain/posts";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  r2: null as unknown,
  event: {} as Record<string, unknown>,
}));
vi.mock("./db", () => ({ db: () => mocks.db }));
vi.mock("./r2", () => ({ r2: () => mocks.r2 }));
vi.mock("./event", () => ({ getEvent: async () => mocks.event, EVENT_COLUMNS: "id" }));

import {
  ADMIN_COOKIE,
  confirmMonogram,
  confirmQr,
  getAdminEvent,
  getModerationPage,
  getQrObject,
  isAdmin,
  login,
  logout,
  mediaManifest,
  presignMonogram,
  presignQr,
  presignStripTemplate,
  confirmStripTemplate,
  removeStripTemplate,
  removeMonogram,
  requireAdmin,
  setHidden,
  setPinned,
  updateEvent,
} from "./admin";

const EVENT_ID = "e0000000-0000-4000-8000-000000000001";
const ok = (data: unknown): DbResult => ({ data, error: null });
const failure = (code: string): DbResult => ({ data: null, error: { code, message: code } });
const eventRow = (over = {}) => ({
  id: EVENT_ID,
  groom_name: "Groom",
  bride_name: "Bride",
  header_message: "Hi",
  uploads_open: true,
  qr_path: null,
  qr_account_name: null,
  qr_bank: null,
  font_names: null,
  font_wishes: null,
  font_body: null,
  monogram_path: null,
  strip_template_path: null,
  strip_windows: null,
  event_date: null,
  ...over,
});

function jar() {
  const store = new Map<string, string>();
  const set = vi.fn((name: string, value: string) => void store.set(name, value));
  return {
    store,
    set,
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    delete: (name: string) => void store.delete(name),
  };
}

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
beforeEach(() => {
  mocks.event = eventRow();
  mocks.db = fakeDb([]).db;
  mocks.r2 = fakeR2().r2;
});

describe("login and the admin cookie", () => {
  const signIn = async (passcode = validEnv.ADMIN_PASSCODE) => {
    const c = jar();
    const fake = fakeDb([ok(null), ok(null)]);
    mocks.db = fake.db;
    await login(passcode, "1.2.3.4, 10.0.0.1", c);
    return { c, calls: fake.calls };
  };

  it("sets an httpOnly, strict cookie that isAdmin accepts, and clears the caller's attempts", async () => {
    const { c, calls } = await signIn();
    expect(c.set).toHaveBeenCalledWith(
      ADMIN_COOKIE,
      expect.stringMatching(/^\d+\./),
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 86400 }),
    );
    expect(isAdmin(c)).toBe(true);
    expect(() => requireAdmin(c)).not.toThrow();
    expect(calls.map((x) => x.method)).toEqual(["admin_login_attempt", "admin_login_clear"]);
  });

  it("marks the admin cookie Secure in production only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { c } = await signIn();
    expect(c.set).toHaveBeenCalledWith(ADMIN_COOKIE, expect.any(String), expect.objectContaining({ secure: true }));
    vi.stubEnv("NODE_ENV", "test");
    const { c: dev } = await signIn();
    expect(dev.set).toHaveBeenCalledWith(ADMIN_COOKIE, expect.any(String), expect.objectContaining({ secure: false }));
  });

  it("puts every address of one IPv6 /64 in the same bucket", async () => {
    const bucketOf = async (ip: string) => {
      const fake = fakeDb([ok(null), ok(null)]);
      mocks.db = fake.db;
      await login(validEnv.ADMIN_PASSCODE, ip, jar());
      return (fake.calls[0]!.args[0] as { p_ip_hash: string }).p_ip_hash;
    };
    const a = await bucketOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(await bucketOf("2001:db8:1:2:1:2:3:4")).toBe(a);
    expect(await bucketOf("2001:db8:1:3:1:2:3:4")).not.toBe(a);
  });

  it("counts the attempt by a hash of the first forwarded address, never the address itself", async () => {
    const { calls } = await signIn();
    const args = calls[0]!.args[0] as { p_ip_hash: string; p_max: number };
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_ip_hash).not.toContain("1.2.3.4");
    expect(args.p_max).toBe(5);
  });

  it("is a 401 for a wrong passcode and sets no cookie", async () => {
    const c = jar();
    mocks.db = fakeDb([ok(null)]).db;
    await expect(login("nope", null, c)).rejects.toMatchObject({ status: 401, code: "wrong_passcode" });
    expect(c.set).not.toHaveBeenCalled();
  });

  it("is a 429 once the database says the caller is out of tries, without comparing the passcode", async () => {
    const c = jar();
    mocks.db = fakeDb([failure("PT429")]).db;
    await expect(login(validEnv.ADMIN_PASSCODE, null, c)).rejects.toMatchObject({ status: 429 });
    expect(c.set).not.toHaveBeenCalled();
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(login("x", null, jar())).rejects.toThrow(/login attempt/);
  });

  it("rejects a missing, malformed, tampered or expired cookie", async () => {
    const { c } = await signIn();
    const [expires, mac] = c.store.get(ADMIN_COOKIE)!.split(".");
    const bad = [undefined, "", "garbage", `${expires}.`, `${expires}.${mac}x`, `${Number(expires) + 60}.${mac}`, `1.${mac}`];
    for (const value of bad) {
      const t = jar();
      if (value !== undefined) t.store.set(ADMIN_COOKIE, value);
      expect(isAdmin(t)).toBe(false);
      expect(() => requireAdmin(t)).toThrowError(expect.objectContaining({ status: 401 }));
    }
  });

  it("logout removes the cookie", async () => {
    const { c } = await signIn();
    logout(c);
    expect(isAdmin(c)).toBe(false);
  });
});

describe("the event", () => {
  it("shows empty text for optional fields and whether a QR exists", async () => {
    mocks.event = eventRow({ header_message: null, qr_path: "events/x/admin/qr-1.png" });
    expect(await getAdminEvent()).toEqual({
      groomName: "Groom",
      brideName: "Bride",
      headerMessage: "",
      uploadsOpen: true,
      qrAccountName: "",
      qrBank: "",
      hasQr: true,
      fonts: { names: "pinyon-script", wishes: "cormorant-garamond", body: "poppins" },
      monogramUrl: null,
      stripTemplateUrl: "/strip/default-template.png",
      hasStripTemplate: false,
      stripWindows: [
        { x: 290, y: 250, w: 500, h: 375 },
        { x: 290, y: 665, w: 500, h: 375 },
        { x: 290, y: 1080, w: 500, h: 375 },
      ],
      eventDate: null,
    });
  });

  it("returns the saved template, windows and date", async () => {
    const wins = [
      { x: 0, y: 0, w: 200, h: 200 },
      { x: 0, y: 300, w: 200, h: 200 },
      { x: 0, y: 600, w: 200, h: 200 },
    ];
    mocks.event = eventRow({ strip_template_path: "events/e/admin/strip-1.png", strip_windows: wins, event_date: "2026-11-07" });
    const e = await getAdminEvent();
    expect(e.stripTemplateUrl).toBe("/strip/template?v=events%2Fe%2Fadmin%2Fstrip-1.png");
    expect(e.hasStripTemplate).toBe(true);
    expect(e.stripWindows).toEqual(wins);
    expect(e.eventDate).toBe("2026-11-07");
  });

  it("returns default fonts and no monogram when the columns are null", async () => {
    const e = await getAdminEvent();
    expect(e.fonts).toEqual({ names: "pinyon-script", wishes: "cormorant-garamond", body: "poppins" });
    expect(e.monogramUrl).toBeNull();
  });

  it("returns the stored fonts and a media url for the monogram", async () => {
    mocks.event = eventRow({ font_names: "great-vibes", monogram_path: "events/e/admin/monogram-1.png" });
    const e = await getAdminEvent();
    expect(e.fonts.names).toBe("great-vibes");
    expect(e.monogramUrl).toBe("https://media.example.com/events/e/admin/monogram-1.png");
  });

  it("falls back to the default for a font key that is not in the list", async () => {
    mocks.event = eventRow({ font_body: "comic-sans" });
    expect((await getAdminEvent()).fonts.body).toBe("poppins");
  });

  it("updates only the fields sent, and turns empty optional text into null", async () => {
    const { db, calls } = fakeDb([ok(eventRow({ uploads_open: false, header_message: null }))]);
    mocks.db = db;
    const result = await updateEvent({ uploadsOpen: false, headerMessage: "", qrBank: "Maybank" });
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({
      header_message: null,
      qr_bank: "Maybank",
      uploads_open: false,
    });
    expect(calls.find((c) => c.method === "eq")!.args).toEqual(["id", EVENT_ID]);
    expect(result.uploadsOpen).toBe(false);
  });

  it("maps the names and the account name too", async () => {
    const { db, calls } = fakeDb([ok(eventRow())]);
    mocks.db = db;
    await updateEvent({ groomName: "A", brideName: "B", qrAccountName: "" });
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({
      groom_name: "A",
      bride_name: "B",
      qr_account_name: null,
    });
  });

  it("writes font_names, font_wishes and font_body", async () => {
    const { db, calls } = fakeDb([ok(eventRow())]);
    mocks.db = db;
    await updateEvent({ fontNames: "allura", fontWishes: "lora", fontBody: "inter" });
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({
      font_names: "allura",
      font_wishes: "lora",
      font_body: "inter",
    });
  });

  it("writes the strip windows and the event date, null resetting them", async () => {
    const { db, calls } = fakeDb([ok(eventRow()), ok(eventRow())]);
    mocks.db = db;
    const wins = [{ x: 1, y: 2, w: 300, h: 300 }];
    await updateEvent({ stripWindows: wins, eventDate: "2026-11-07" });
    await updateEvent({ stripWindows: null, eventDate: null });
    const updates = calls.filter((c) => c.method === "update").map((c) => c.args[0]);
    expect(updates).toEqual([
      { strip_windows: wins, event_date: "2026-11-07" },
      { strip_windows: null, event_date: null },
    ]);
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(updateEvent({ uploadsOpen: true })).rejects.toThrow(/Updating the event failed/);
  });
});

describe("the QR", () => {
  const KEY = `events/${EVENT_ID}/admin/qr-11111111-1111-4111-8111-111111111111.png`;
  const setup = (objects: Parameters<typeof fakeR2>[0], queue: DbResult[]) => {
    const r2 = fakeR2(objects);
    const fake = fakeDb(queue);
    mocks.r2 = r2.r2;
    mocks.db = fake.db;
    return { ...r2, ...fake };
  };

  it("presigns a key under this event's admin folder for the exact size and type", async () => {
    const { presigned } = setup({}, []);
    const out = await presignQr("image/png", 12_345);
    expect(out.key).toMatch(new RegExp(`^events/${EVENT_ID}/admin/qr-[0-9a-f-]{36}\\.png$`));
    expect(out.url).toBe(`https://r2.test/${out.key}`);
    expect(presigned).toEqual([{ key: out.key, mime: "image/png", bytes: 12_345 }]);
  });

  it("makes a verified upload the QR and removes the old file", async () => {
    mocks.event = eventRow({ qr_path: "events/old/qr.jpg" });
    const { deleted, calls } = setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [ok(eventRow({ qr_path: KEY }))]);
    const result = await confirmQr(KEY);
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ qr_path: KEY });
    expect(deleted).toEqual(["events/old/qr.jpg"]);
    expect(result.hasQr).toBe(true);
  });

  it("keeps the new QR even when the old file cannot be removed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.event = eventRow({ qr_path: "events/old/qr.jpg" });
    setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [ok(eventRow({ qr_path: KEY }))]);
    (mocks.r2 as { deleteMany: () => Promise<void> }).deleteMany = async () => {
      throw new Error("R2 down");
    };
    await expect(confirmQr(KEY)).resolves.toMatchObject({ hasQr: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("does not delete the file it just confirmed when confirmed twice", async () => {
    mocks.event = eventRow({ qr_path: KEY });
    const { deleted } = setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [ok(eventRow({ qr_path: KEY }))]);
    await confirmQr(KEY);
    expect(deleted).toEqual([]);
  });

  it.each([
    ["a key of another event", "events/other/admin/qr-11111111-1111-4111-8111-111111111111.png"],
    ["a post file", `events/${EVENT_ID}/p/0.jpg`],
    ["a path trick", `events/${EVENT_ID}/admin/../qr-11111111-1111-4111-8111-111111111111.png`],
  ])("refuses %s", async (_name, key) => {
    setup({}, []);
    await expect(confirmQr(key)).rejects.toMatchObject({ status: 400, code: "invalid_key" });
  });

  it.each([
    ["nothing uploaded", {}],
    ["the wrong type", { [KEY]: { bytes: 5000, mime: "image/jpeg" } }],
    ["too large", { [KEY]: { bytes: 3 * 1024 * 1024, mime: "image/png" } }],
    ["a header override", { [KEY]: { bytes: 5000, mime: "image/png", overridden: true } }],
    ["bytes that are not a PNG", { [KEY]: { bytes: 5000, mime: "image/png", start: new Uint8Array(16) } }],
  ])("refuses %s and changes nothing", async (_name, objects) => {
    const { calls } = setup(objects, []);
    await expect(confirmQr(KEY)).rejects.toMatchObject({ status: 400, code: "upload_incomplete" });
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("fails when the database does", async () => {
    setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [failure("XX000")]);
    await expect(confirmQr(KEY)).rejects.toThrow(/Saving the QR failed/);
  });

  it("serves the current QR from the media domain, or null when there is none", async () => {
    expect(await getQrObject()).toBeNull();
    mocks.event = eventRow({ qr_path: "events/e/admin/qr-1.png" });
    const fetchMock = vi.fn(async () => new Response("png-bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const qr = await getQrObject();
    expect(qr?.mime).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith("https://media.example.com/events/e/admin/qr-1.png", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await getQrObject()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("labels a JPEG QR as a JPEG", async () => {
    mocks.event = eventRow({ qr_path: "events/e/admin/qr-1.jpg" });
    vi.stubGlobal("fetch", async () => new Response("x", { status: 200 }));
    expect((await getQrObject())?.mime).toBe("image/jpeg");
    vi.unstubAllGlobals();
  });
});

describe("the monogram", () => {
  const KEY = `events/${EVENT_ID}/admin/monogram-11111111-1111-4111-8111-111111111111.png`;
  const SVG_KEY = `events/${EVENT_ID}/admin/monogram-11111111-1111-4111-8111-111111111111.svg`;
  const OLD = "events/old/monogram.png";
  const svg = (text: string) => ({ bytes: text.length, mime: "image/svg+xml", body: new TextEncoder().encode(text) });
  const setup = (objects: Parameters<typeof fakeR2>[0], queue: DbResult[]) => {
    const r2 = fakeR2(objects);
    const fake = fakeDb(queue);
    mocks.r2 = r2.r2;
    mocks.db = fake.db;
    return { ...r2, ...fake };
  };

  it("presigns a key under this event's admin folder for the exact size and type", async () => {
    const { presigned } = setup({}, []);
    const out = await presignMonogram("image/webp", 4321);
    expect(out.key).toMatch(new RegExp(`^events/${EVENT_ID}/admin/monogram-[0-9a-f-]{36}\\.webp$`));
    expect(presigned).toEqual([{ key: out.key, mime: "image/webp", bytes: 4321 }]);
  });

  it("makes a verified PNG the monogram and removes the old file", async () => {
    mocks.event = eventRow({ monogram_path: OLD });
    const { deleted, calls } = setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [ok(eventRow({ monogram_path: KEY }))]);
    const result = await confirmMonogram(KEY);
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ monogram_path: KEY });
    expect(deleted).toEqual([OLD]);
    expect(result.monogramUrl).toContain(KEY);
  });

  it("keeps the new monogram even when the old file cannot be removed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.event = eventRow({ monogram_path: OLD });
    setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [ok(eventRow({ monogram_path: KEY }))]);
    (mocks.r2 as { deleteMany: () => Promise<void> }).deleteMany = async () => {
      throw new Error("R2 down");
    };
    await expect(confirmMonogram(KEY)).resolves.toMatchObject({ monogramUrl: expect.stringContaining(KEY) });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    ["a key of another event", "events/other/admin/monogram-11111111-1111-4111-8111-111111111111.png"],
    ["a QR key", `events/${EVENT_ID}/admin/qr-11111111-1111-4111-8111-111111111111.png`],
    ["an unknown extension", `events/${EVENT_ID}/admin/monogram-11111111-1111-4111-8111-111111111111.gif`],
    ["a path trick", `events/${EVENT_ID}/admin/../monogram-11111111-1111-4111-8111-111111111111.png`],
  ])("refuses %s without touching storage", async (_name, key) => {
    const { deleted } = setup({ [key]: { bytes: 5000, mime: "image/png" } }, []);
    await expect(confirmMonogram(key)).rejects.toMatchObject({ status: 400, code: "invalid_key" });
    expect(deleted).toEqual([]);
  });

  it.each([
    ["nothing uploaded", {}],
    ["a stored type that differs from the key", { [KEY]: { bytes: 5000, mime: "image/webp" } }],
    ["too large", { [KEY]: { bytes: 2 * 1024 * 1024, mime: "image/png" } }],
    ["a header override", { [KEY]: { bytes: 5000, mime: "image/png", overridden: true } }],
    ["bytes that are not a PNG", { [KEY]: { bytes: 5000, mime: "image/png", start: new Uint8Array(16) } }],
  ])("refuses %s, changes nothing and removes the upload", async (_name, objects) => {
    const { calls, deleted } = setup(objects, []);
    await expect(confirmMonogram(KEY)).rejects.toMatchObject({ status: 400, code: "upload_incomplete" });
    expect(calls.some((c) => c.method === "update")).toBe(false);
    expect(deleted).toEqual([KEY]);
  });

  it("refuses an SVG with a script and deletes it", async () => {
    const { deleted, calls } = setup({ [SVG_KEY]: svg("<svg><script>alert(1)</script></svg>") }, []);
    await expect(confirmMonogram(SVG_KEY)).rejects.toMatchObject({
      status: 400,
      code: "unsafe_svg",
      message: "That SVG can’t be used. Export it again without scripts or links.",
    });
    expect(deleted).toEqual([SVG_KEY]);
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("refuses an SVG whose body cannot be read", async () => {
    const { deleted } = setup({ [SVG_KEY]: { bytes: 10, mime: "image/svg+xml" } }, []);
    await expect(confirmMonogram(SVG_KEY)).rejects.toMatchObject({ code: "upload_incomplete" });
    expect(deleted).toEqual([SVG_KEY]);
  });

  it("does not delete the live monogram when a retry with its key hits a storage error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.event = eventRow({ monogram_path: KEY });
    const { deleted } = setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, []);
    (mocks.r2 as { head: () => Promise<never> }).head = async () => {
      throw new Error("R2 down");
    };
    await expect(confirmMonogram(KEY)).rejects.toMatchObject({ code: "upload_incomplete" });
    expect(deleted).toEqual([]);
    log.mockRestore();
  });

  it("refuses an SVG in another encoding, where an ESC byte hides a script tag", async () => {
    const text = '<?xml version="1.0" encoding="ISO-2022-JP"?><svg><scr\x1b(Bipt>x</script></svg>';
    const { deleted } = setup({ [SVG_KEY]: svg(text) }, []);
    await expect(confirmMonogram(SVG_KEY)).rejects.toMatchObject({ code: "unsafe_svg" });
    expect(deleted).toEqual([SVG_KEY]);
  });

  it("calls a PNG renamed .svg an incomplete upload, not an unsafe SVG", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    const { deleted } = setup({ [SVG_KEY]: { bytes: png.length, mime: "image/svg+xml", body: png } }, []);
    await expect(confirmMonogram(SVG_KEY)).rejects.toMatchObject({
      code: "upload_incomplete",
      message: "The monogram image didn’t finish uploading. Please try again.",
    });
    expect(deleted).toEqual([SVG_KEY]);
  });

  it("accepts a clean SVG", async () => {
    const { deleted } = setup({ [SVG_KEY]: svg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>') }, [
      ok(eventRow({ monogram_path: SVG_KEY })),
    ]);
    await expect(confirmMonogram(SVG_KEY)).resolves.toMatchObject({ monogramUrl: expect.stringContaining(SVG_KEY) });
    expect(deleted).toEqual([]);
  });

  it("fails when the database does", async () => {
    setup({ [KEY]: { bytes: 5000, mime: "image/png" } }, [failure("XX000")]);
    await expect(confirmMonogram(KEY)).rejects.toThrow(/Saving the monogram failed/);
  });

  it("removes the monogram and its file", async () => {
    mocks.event = eventRow({ monogram_path: OLD });
    const { deleted, calls } = setup({}, [ok(eventRow())]);
    const result = await removeMonogram();
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ monogram_path: null });
    expect(deleted).toEqual([OLD]);
    expect(result.monogramUrl).toBeNull();
  });

  it("does nothing when there is no monogram", async () => {
    const { deleted, calls } = setup({}, []);
    expect((await removeMonogram()).monogramUrl).toBeNull();
    expect(deleted).toEqual([]);
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });
});

describe("the strip template", () => {
  const KEY = `events/${EVENT_ID}/admin/strip-11111111-1111-4111-8111-111111111111.png`;
  const JPG_KEY = `events/${EVENT_ID}/admin/strip-11111111-1111-4111-8111-111111111111.jpg`;
  const OLD = `events/${EVENT_ID}/admin/strip-00000000-0000-4000-8000-000000000000.png`;
  const png = (w: number, h: number) => {
    const b = new Uint8Array(40);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return { bytes: b.length, mime: "image/png", body: b };
  };
  const jpeg = (w: number, h: number) => {
    const body = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 3, 0, 0, 0, 0]);
    return { bytes: body.length, mime: "image/jpeg", body };
  };
  const setup = (objects: Parameters<typeof fakeR2>[0], queue: DbResult[]) => {
    const r2 = fakeR2(objects);
    const fake = fakeDb(queue);
    mocks.r2 = r2.r2;
    mocks.db = fake.db;
    return { ...r2, ...fake };
  };

  it("presigns a PNG or JPEG key under this event's admin folder", async () => {
    const { presigned } = setup({}, []);
    const out = await presignStripTemplate("image/jpeg", 1234);
    expect(out.key).toMatch(new RegExp(`^events/${EVENT_ID}/admin/strip-[0-9a-f-]{36}\\.jpg$`));
    expect(presigned).toEqual([{ key: out.key, mime: "image/jpeg", bytes: 1234 }]);
  });

  it("makes a 1080 x 1920 PNG the template and removes the old one", async () => {
    mocks.event = eventRow({ strip_template_path: OLD });
    const { deleted, calls } = setup({ [KEY]: png(1080, 1920) }, [ok(eventRow({ strip_template_path: KEY }))]);
    const result = await confirmStripTemplate(KEY);
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ strip_template_path: KEY });
    expect(deleted).toEqual([OLD]);
    expect(result.hasStripTemplate).toBe(true);
  });

  it("accepts a 1080 x 1920 JPEG", async () => {
    mocks.event = eventRow();
    const { deleted } = setup({ [JPG_KEY]: jpeg(1080, 1920) }, [ok(eventRow({ strip_template_path: JPG_KEY }))]);
    await expect(confirmStripTemplate(JPG_KEY)).resolves.toMatchObject({ hasStripTemplate: true });
    expect(deleted).toEqual([]);
  });

  it("refuses the wrong size with both sizes in the message, and deletes the upload", async () => {
    mocks.event = eventRow();
    const { deleted, calls } = setup({ [JPG_KEY]: jpeg(1080, 1350) }, []);
    await expect(confirmStripTemplate(JPG_KEY)).rejects.toMatchObject({
      status: 400,
      code: "wrong_size",
      message: "The template must be 1080 × 1920 px (Instagram story size). Yours is 1080 × 1350.",
    });
    expect(deleted).toEqual([JPG_KEY]);
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it.each([
    ["a key of another event", "events/other/admin/strip-11111111-1111-4111-8111-111111111111.png"],
    ["a monogram key", `events/${EVENT_ID}/admin/monogram-11111111-1111-4111-8111-111111111111.png`],
    ["a WebP", `events/${EVENT_ID}/admin/strip-11111111-1111-4111-8111-111111111111.webp`],
  ])("refuses %s without touching storage", async (_name, key) => {
    mocks.event = eventRow();
    const { deleted } = setup({ [key]: png(1080, 1920) }, []);
    await expect(confirmStripTemplate(key)).rejects.toMatchObject({ status: 400, code: "invalid_key" });
    expect(deleted).toEqual([]);
  });

  it.each([
    ["nothing uploaded", {}],
    ["a stored type that differs from the key", { [KEY]: { ...png(1080, 1920), mime: "image/jpeg" } }],
    ["too large", { [KEY]: { ...png(1080, 1920), bytes: 3 * 1024 * 1024 + 1 } }],
    ["bytes that are not a PNG", { [KEY]: { bytes: 40, mime: "image/png", body: new Uint8Array(40) } }],
    ["a body that cannot be read", { [KEY]: { bytes: 40, mime: "image/png" } }],
  ])("refuses %s as incomplete and removes the upload", async (_name, objects) => {
    mocks.event = eventRow();
    const { deleted } = setup(objects, []);
    await expect(confirmStripTemplate(KEY)).rejects.toMatchObject({ status: 400, code: "upload_incomplete" });
    expect(deleted).toEqual([KEY]);
  });

  it("does not delete the live template when a retry with its key hits a storage error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.event = eventRow({ strip_template_path: KEY });
    const { deleted } = setup({ [KEY]: png(1080, 1920) }, []);
    (mocks.r2 as { head: () => Promise<never> }).head = async () => {
      throw new Error("R2 down");
    };
    await expect(confirmStripTemplate(KEY)).rejects.toMatchObject({ code: "upload_incomplete" });
    expect(deleted).toEqual([]);
    log.mockRestore();
  });

  it("fails when saving fails", async () => {
    mocks.event = eventRow();
    setup({ [KEY]: png(1080, 1920) }, [failure("XX000")]);
    await expect(confirmStripTemplate(KEY)).rejects.toThrow(/Saving the template failed/);
  });

  it("goes back to the default template and deletes the file", async () => {
    mocks.event = eventRow({ strip_template_path: OLD });
    const { deleted, calls } = setup({}, [ok(eventRow())]);
    const result = await removeStripTemplate();
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ strip_template_path: null });
    expect(deleted).toEqual([OLD]);
    expect(result).toMatchObject({ hasStripTemplate: false, stripTemplateUrl: "/strip/default-template.png" });
  });

  it("does nothing when the default is already in use", async () => {
    mocks.event = eventRow();
    const { deleted, calls } = setup({}, []);
    expect((await removeStripTemplate()).hasStripTemplate).toBe(false);
    expect(deleted).toEqual([]);
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("fails when removing fails", async () => {
    mocks.event = eventRow({ strip_template_path: OLD });
    setup({}, [failure("XX000")]);
    await expect(removeStripTemplate()).rejects.toThrow(/Removing the template failed/);
  });
});

describe("moderation", () => {
  const STAMP = "2026-10-25T10:00:00.123456+00:00";
  const row = (n: number, hidden = false, pinned_at: string | null = null) => ({
    id: `b0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    type: "wish",
    caption: null,
    wish_text: "Congrats",
    created_at: STAMP,
    guest_id: "g1",
    guests: { name: "Ali" },
    post_media: [],
    hidden,
    pinned_at,
  });

  it("lists posts including hidden ones, flagged, with a cursor when there is more", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1, i === 0, i === 1 ? STAMP : null));
    mocks.db = fakeDb([ok(rows)]).db;
    const page = await getModerationPage(null);
    expect(page.posts).toHaveLength(24);
    expect(page.posts[0]).toMatchObject({ id: rows[0]!.id, hidden: true, pinned: false, author: "Ali" });
    expect(page.posts[1]).toMatchObject({ hidden: false, pinned: true });
    expect(page.nextCursor).not.toBeNull();
  });

  it("ends the list on a short page and continues from a cursor", async () => {
    const { db, calls } = fakeDb([ok([row(1)])]);
    mocks.db = db;
    const page = await getModerationPage(encodeCursor(STAMP, row(2).id));
    expect(page.nextCursor).toBeNull();
    expect(calls.some((c) => c.method === "or")).toBe(true);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "hidden")).toBe(false);
  });

  it("is a 400 for a bad cursor and fails when the database does", async () => {
    await expect(getModerationPage("nonsense")).rejects.toMatchObject({ status: 400 });
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(getModerationPage(null)).rejects.toThrow(/Loading posts failed/);
  });

  it("hides and unhides a post of this event", async () => {
    const { db, calls } = fakeDb([ok([{ id: "p1" }])]);
    mocks.db = db;
    await setHidden("p1", true);
    // Hiding unpins too: the database refuses a pinned hidden post.
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ hidden: true, pinned_at: null });
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["id", "p1"], ["event_id", EVENT_ID]]);
    const unhide = fakeDb([ok([{ id: "p1" }])]);
    mocks.db = unhide.db;
    await setHidden("p1", false);
    expect(unhide.calls.find((c) => c.method === "update")!.args[0]).toEqual({ hidden: false });
  });

  it("is a 404 when no post matched and fails when the database does", async () => {
    mocks.db = fakeDb([ok([])]).db;
    await expect(setHidden("p1", true)).rejects.toMatchObject({ status: 404 });
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(setHidden("p1", true)).rejects.toThrow(/Updating the post failed/);
  });
});

describe("setPinned", () => {
  const post = (over = {}) => ok({ hidden: false, pinned_at: null, ...over });
  const updates = (calls: { method: string; args: unknown[] }[]) =>
    calls.filter((c) => c.method === "update").map((c) => c.args[0]);

  it("pins a visible post of this event while fewer than MAX_PINS others are pinned", async () => {
    const { db, calls } = fakeDb([post(), { data: null, count: MAX_PINS - 1, error: null }, ok([{ id: "p1" }])]);
    mocks.db = db;
    await setPinned("p1", true);
    const [update] = updates(calls) as { pinned_at: string }[];
    expect(Date.parse(update!.pinned_at)).not.toBeNaN();
    expect(calls.find((c) => c.method === "not")!.args).toEqual(["pinned_at", "is", null]);
    expect(calls.filter((c) => c.method === "eq" && c.args[0] === "event_id").every((c) => c.args[1] === EVENT_ID)).toBe(true);
  });

  it("refuses a pin past the limit, a hidden post and a post not in this event", async () => {
    mocks.db = fakeDb([post(), { data: null, count: MAX_PINS, error: null }]).db;
    await expect(setPinned("p1", true)).rejects.toMatchObject({ status: 409, code: "pin_limit" });
    mocks.db = fakeDb([post({ hidden: true })]).db;
    await expect(setPinned("p1", true)).rejects.toMatchObject({ status: 409, code: "post_hidden" });
    mocks.db = fakeDb([ok(null)]).db;
    await expect(setPinned("p1", true)).rejects.toMatchObject({ status: 404 });
  });

  it("leaves an already pinned post where it is", async () => {
    const { db, calls } = fakeDb([post({ pinned_at: "2026-11-06T10:00:00Z" })]);
    mocks.db = db;
    await setPinned("p1", true);
    expect(updates(calls)).toEqual([]);
  });

  it("unpins without any checks, and is a 404 when nothing matched", async () => {
    const { db, calls } = fakeDb([ok([{ id: "p1" }])]);
    mocks.db = db;
    await setPinned("p1", false);
    expect(updates(calls)).toEqual([{ pinned_at: null }]);
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["id", "p1"], ["event_id", EVENT_ID]]);
    mocks.db = fakeDb([ok([])]).db;
    await expect(setPinned("p1", false)).rejects.toMatchObject({ status: 404 });
  });

  it("maps a post hidden mid-pin to post_hidden and fails when the database does", async () => {
    mocks.db = fakeDb([post(), { data: null, count: 0, error: null }, failure("23514")]).db;
    await expect(setPinned("p1", true)).rejects.toMatchObject({ status: 409, code: "post_hidden" });
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(setPinned("p1", true)).rejects.toThrow(/Loading the post failed/);
    mocks.db = fakeDb([post(), failure("XX000")]).db;
    await expect(setPinned("p1", true)).rejects.toThrow(/Counting pins failed/);
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(setPinned("p1", false)).rejects.toThrow(/Updating the post failed/);
  });
});

describe("mediaManifest", () => {
  it("names every file after its guest, day, post and place, using safe characters", async () => {
    mocks.db = fakeDb([
      ok([
        {
          id: "abcdef12-0000-4000-8000-000000000000",
          created_at: "2026-10-25T10:00:00+00:00",
          guests: { name: "Ali/Siti" },
          post_media: [
            { path: "events/e/p/0.jpg", position: 0 },
            { path: "events/e/p/1.mp4", position: 1 },
          ],
        },
        { id: "11111111-0000-4000-8000-000000000000", created_at: "2026-10-25T11:00:00+00:00", guests: null, post_media: [] },
      ]),
    ]).db;
    expect(await mediaManifest()).toEqual([
      { url: "https://media.example.com/events/e/p/0.jpg", name: "Ali_Siti/2026-10-25-abcdef12-1.jpg" },
      { url: "https://media.example.com/events/e/p/1.mp4", name: "Ali_Siti/2026-10-25-abcdef12-2.mp4" },
    ]);
  });

  it("keeps reading while a page comes back full, so a big event is not cut at 1000 posts", async () => {
    const post = (n: number) => ({
      id: `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`,
      created_at: "2026-10-25T10:00:00+00:00",
      guests: { name: "Ali" },
      post_media: [{ path: `events/e/p${n}/0.jpg`, position: 0 }],
    });
    const full = Array.from({ length: 1000 }, (_, i) => post(i));
    const { db, calls } = fakeDb([ok(full), ok([post(1000)])]);
    mocks.db = db;
    expect(await mediaManifest()).toHaveLength(1001);
    expect(calls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("cannot name a zip entry outside its folder, whatever the guest is called", async () => {
    mocks.db = fakeDb([
      ok(
        ["..", " . ", "a/../b", "Ali."].map((name, i) => ({
          id: `abcdef1${i}-0000-4000-8000-000000000000`,
          created_at: "2026-10-25T10:00:00+00:00",
          guests: { name },
          post_media: [{ path: "events/e/p/0.jpg", position: 0 }],
        })),
      ),
    ]).db;
    const names = (await mediaManifest()).map((e) => e.name);
    expect(names.every((n) => /^[^/]+\/2026/.test(n) && !n.startsWith("."))).toBe(true);
    expect(names[0]).toMatch(/^guest\//);
    expect(names[3]).toMatch(/^Ali\//);
  });

  it("fails when the database does", async () => {
    mocks.db = fakeDb([failure("XX000")]).db;
    await expect(mediaManifest()).rejects.toThrow(/Loading media failed/);
  });
});
