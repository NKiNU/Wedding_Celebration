// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BASE, join, uploadedIntent } from "../fixtures/phone";

/**
 * The wedding's peak: many phones joining and posting at the same moment. Each phone joins, posts
 * a wish, then uploads a photo and posts it. Run it against a dev or staging stack, never the live
 * event (it adds guests and posts):
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration/load.test.ts
 *   LOAD_PHONES=100 INTEGRATION_BASE_URL=https://staging.example SUPABASE_INTEGRATION=1 npx vitest run tests/integration/load.test.ts
 * Every phone is a new guest that stays in the database (it counts toward MAX_GUESTS_PER_EVENT), and
 * all of them join from this one address, so keep LOAD_PHONES under JOINS_PER_IP_PER_WINDOW.
 * `next dev` compiles routes on first use, so for numbers worth reading run it against `npm start`.
 */
const PHONES = Number(process.env.LOAD_PHONES ?? 30);
const SLOWEST_OK_MS = 10_000 * Math.max(1, PHONES / 30); // a phone does six requests in a row, so time grows with the crowd

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;

describe.skipIf(!process.env.SUPABASE_INTEGRATION)("load: many phones at once (real stack)", { timeout: 180_000 }, () => {
  it(`${PHONES} phones join and post a wish and a photo together without a single failure`, async () => {
    const started = Date.now();
    const timings = await Promise.all(
      Array.from({ length: PHONES }, async () => {
        const t0 = performance.now();
        const phone = await join();
        const joined = performance.now() - t0;
        expect((await phone.call("POST", "/api/posts", { wishText: "Semoga bahagia sentiasa" })).status).toBe(201);
        const { postId } = await uploadedIntent(phone);
        expect((await phone.call("POST", "/api/posts", { postId, caption: "Load test" })).status).toBe(201);
        return { joined, total: performance.now() - t0 };
      }),
    );

    const totals = timings.map((t) => t.total).sort((a, b) => a - b);
    console.log(
      `${PHONES} phones in ${Date.now() - started} ms: join+wish+photo p50 ${Math.round(percentile(totals, 0.5))} ms, ` +
        `p95 ${Math.round(percentile(totals, 0.95))} ms, slowest ${Math.round(totals.at(-1)!)} ms`,
    );
    expect(totals.at(-1)).toBeLessThan(SLOWEST_OK_MS);

    const wall = await fetch(`${BASE}/api/posts`).then((r) => r.json());
    expect(wall.ok).toBe(true);
  });
});
