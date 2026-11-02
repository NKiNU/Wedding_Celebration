// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { bucketOf, clientIp, ipHash } from "./ip";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

describe("clientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("trusts the proxy's x-real-ip, never a header the client can choose", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9", "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("without x-real-ip takes the last x-forwarded-for entry, the one the proxy appended", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1" }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });
});

describe("ipHash", () => {
  it("never returns the address itself, and is stable", () => {
    expect(ipHash("9.9.9.9")).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("9.9.9.9")).toBe(ipHash("9.9.9.9"));
    expect(ipHash("9.9.9.9")).not.toBe(ipHash("9.9.9.8"));
  });

  it("puts a whole IPv6 /64 in one bucket", () => {
    expect(ipHash("2001:db8:1:2:aaaa::1")).toBe(ipHash("2001:db8:1:2:bbbb::9"));
    expect(ipHash("2001:db8:1:3::1")).not.toBe(ipHash("2001:db8:1:2::1"));
  });

  it("puts callers with no address in one shared bucket", () => {
    expect(ipHash(null)).toBe(ipHash(""));
  });
});

describe("bucketOf", () => {
  it("expands the short IPv6 form before taking the /64", () => {
    expect(bucketOf("2001:db8::a:b:c:d")).toBe("2001:db8:0:0");
    expect(bucketOf("2001:db8::1:b:c:d")).toBe(bucketOf("2001:db8::ffff:b:c:d"));
    expect(bucketOf("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2");
    expect(bucketOf("2001:db8:1:2::9")).toBe("2001:db8:1:2");
    expect(bucketOf("fe80::1%eth0")).toBe("fe80:0:0:0");
    expect(bucketOf("[2001:DB8:1:2::1]")).toBe("2001:db8:1:2");
    expect(bucketOf("::1")).toBe("0:0:0:0");
  });

  it("treats an IPv4 address written as IPv6 as that IPv4 address", () => {
    expect(bucketOf("::ffff:9.9.9.9")).toBe("9.9.9.9");
    expect(bucketOf("0:0:0:0:0:ffff:9.9.9.9")).toBe("9.9.9.9");
    expect(bucketOf("9.9.9.9")).toBe("9.9.9.9");
  });
});
