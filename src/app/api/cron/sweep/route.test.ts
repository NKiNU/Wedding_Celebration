import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http";

const mocks = vi.hoisted(() => ({ assertCronRequest: vi.fn(), sweepUploads: vi.fn(), purgeAdminAttempts: vi.fn(), purgeRateAttempts: vi.fn() }));
vi.mock("@/server/sweep", () => mocks);

import { GET } from "./route";

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/cron/sweep", { headers }));

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.sweepUploads.mockResolvedValue({ removed: 3, failed: 0 });
});

describe("GET /api/cron/sweep", () => {
  it("runs the sweep for an authorised call and reports what it did", async () => {
    const res = await call({ authorization: "Bearer secret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { removed: 3, failed: 0 } });
    expect(mocks.assertCronRequest).toHaveBeenCalledWith("Bearer secret");
    expect(mocks.purgeAdminAttempts).toHaveBeenCalled();
    expect(mocks.purgeRateAttempts).toHaveBeenCalled();
  });

  it("sweeps nothing when the secret is wrong or missing", async () => {
    mocks.assertCronRequest.mockImplementation(() => {
      throw new AppError("unauthorized", 401, "Not allowed.");
    });
    expect((await call()).status).toBe(401);
    expect(mocks.assertCronRequest).toHaveBeenCalledWith(null);
    expect(mocks.sweepUploads).not.toHaveBeenCalled();
  });
});
