// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";

const mocks = vi.hoisted(() => ({ event: {} as Record<string, unknown> }));
vi.mock("./event", () => ({ getEvent: async () => mocks.event }));

import { getStripTemplateObject } from "./strip";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllGlobals());

describe("getStripTemplateObject", () => {
  it("is null when the event uses the default template", async () => {
    mocks.event = { strip_template_path: null };
    expect(await getStripTemplateObject()).toBeNull();
  });

  it("streams the admin's template from the media domain", async () => {
    mocks.event = { strip_template_path: "events/e/admin/strip-1.png" };
    const fetchMock = vi.fn(async () => new Response("png-bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = await getStripTemplateObject();
    expect(t?.mime).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith("https://media.example.com/events/e/admin/strip-1.png", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("labels a JPEG template, and is null when the media domain fails", async () => {
    mocks.event = { strip_template_path: "events/e/admin/strip-1.jpg" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 200 })));
    expect((await getStripTemplateObject())?.mime).toBe("image/jpeg");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await getStripTemplateObject()).toBeNull();
  });
});
