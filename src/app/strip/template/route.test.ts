import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStripTemplateObject: vi.fn() }));
vi.mock("@/server/strip", () => ({ getStripTemplateObject: mocks.getStripTemplateObject }));
vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET } from "./route";

beforeEach(() => mocks.getStripTemplateObject.mockReset());

describe("GET /strip/template", () => {
  it("streams the admin's template with a long cache", async () => {
    mocks.getStripTemplateObject.mockResolvedValue({ body: new Response("png").body, mime: "image/png" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("png");
  });

  it("redirects to the default template when the admin has none", async () => {
    mocks.getStripTemplateObject.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/strip/default-template.png");
  });
});
