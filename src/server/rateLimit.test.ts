import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_RATE_WINDOW_MS } from "@/lib/domain/limits";
import { AppError } from "./http";
import { clientIp, ipBucket, rateLimit, resetRateLimits, trackedWindows } from "./rateLimit";

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimits();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const refused = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

describe("rateLimit", () => {
  it("lets `max` calls through and refuses the next with 429", () => {
    for (let i = 0; i < 3; i++) rateLimit("join", "1.1.1.1", 3);
    const e = refused(() => rateLimit("join", "1.1.1.1", 3));
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("counts each bucket and each address on its own", () => {
    rateLimit("join", "1.1.1.1", 1);
    expect(() => rateLimit("wall", "1.1.1.1", 1)).not.toThrow();
    expect(() => rateLimit("join", "2.2.2.2", 1)).not.toThrow();
    expect(refused(() => rateLimit("join", "1.1.1.1", 1))).not.toBeNull();
  });

  it("starts a fresh window once the old one has passed", () => {
    rateLimit("join", "1.1.1.1", 1);
    expect(refused(() => rateLimit("join", "1.1.1.1", 1))).not.toBeNull();
    vi.advanceTimersByTime(API_RATE_WINDOW_MS);
    expect(() => rateLimit("join", "1.1.1.1", 1)).not.toThrow();
  });

  it("keeps a longer window of its own length, next to the per-minute one", () => {
    const HOUR = 60 * 60_000;
    rateLimit("join-hour", "1.1.1.1", 1, HOUR);
    vi.advanceTimersByTime(API_RATE_WINDOW_MS * 2);
    expect(refused(() => rateLimit("join-hour", "1.1.1.1", 1, HOUR))).not.toBeNull();
    vi.advanceTimersByTime(HOUR);
    expect(() => rateLimit("join-hour", "1.1.1.1", 1, HOUR)).not.toThrow();
  });

  it("shares one bucket when the address is unknown", () => {
    rateLimit("join", null, 1);
    expect(refused(() => rateLimit("join", null, 1))).not.toBeNull();
  });

  it("drops ended windows once many are tracked, so memory shrinks", () => {
    for (let i = 0; i < 10_001; i++) rateLimit("fill", `10.0.${i >> 8}.${i & 255}`, 5);
    expect(trackedWindows()).toBe(10_001);
    vi.advanceTimersByTime(API_RATE_WINDOW_MS);
    rateLimit("fill", "9.9.9.9", 5);
    expect(trackedWindows()).toBe(1);
  });

  it("never tracks more than the hard cap, forgetting the oldest first", () => {
    for (let i = 0; i < 50_005; i++) rateLimit("flood", `10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`, 5);
    expect(trackedWindows()).toBeLessThanOrEqual(50_000);
    rateLimit("flood", "10.0.0.0", 1); // the oldest address was forgotten: this is a fresh first count
    expect(refused(() => rateLimit("flood", "10.0.0.0", 1))).not.toBeNull(); // and the second is refused
  });
});

describe("ipBucket", () => {
  it("keeps an IPv4 address as it is, and unwraps an IPv4-mapped IPv6 one", () => {
    expect(ipBucket("9.9.9.9")).toBe("9.9.9.9");
    expect(ipBucket("::ffff:9.9.9.9")).toBe("9.9.9.9");
  });

  it("groups an IPv6 address by its /64, so rotating the host part does not dodge the limit", () => {
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(ipBucket("2001:db8:1:2:1:2:3:4"));
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).not.toBe(ipBucket("2001:db8:1:3:aaaa:bbbb:cccc:dddd"));
  });

  it("expands `::` first, so a compressed address cannot pull host bits into the bucket", () => {
    expect(ipBucket("2001:db8::a:b:c:d")).toBe(ipBucket("2001:db8::1:2:3:4"));
    expect(ipBucket("2001:db8::a:b:c:d")).toBe(ipBucket("2001:0db8:0:0:9:9:9:9"));
    expect(ipBucket("::1")).toBe(ipBucket("0:0:0:0:0:0:0:2"));
    expect(ipBucket("2001:DB8::1%eth0")).toBe(ipBucket("2001:db8:0:0::7"));
  });

  it("uses one shared bucket for an unknown address", () => {
    expect(ipBucket(null)).toBe("unknown");
    expect(ipBucket("")).toBe("unknown");
  });
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("on a VPS trusts the proxy's x-real-ip, never a header the client can choose", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9", "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 9.9.9.9" }), false)).toBe("9.9.9.9");
  });

  it("on a VPS without x-real-ip takes the last x-forwarded-for entry, the one the proxy appended", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }), false)).toBe("9.9.9.9");
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1" }), false)).toBeNull();
    expect(clientIp(h({}), false)).toBeNull();
  });

  it("on Vercel uses its own header, else the first x-forwarded-for entry", () => {
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "9.9.9.9" }), true)).toBe("1.1.1.1");
    expect(clientIp(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }), true)).toBe("2.2.2.2");
    expect(clientIp(h({}), true)).toBeNull();
  });

  it("reads VERCEL from the environment by default", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
    vi.stubEnv("VERCEL", "");
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1" }))).toBeNull();
  });
});
