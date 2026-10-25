// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POSTS_PER_HOUR } from "@/lib/domain/limits";
import { BASE, JSON_HEADERS, join, photoFiles, put, uploadedIntent, type Intent } from "../fixtures/phone";

/**
 * The upload pipeline against the real stack: `npm run dev`, `supabase start`, a seeded database,
 * and R2_* pointing at an S3-compatible bucket (local Supabase Storage, see .env.example).
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration
 * Each test joins as its own guest, so nothing depends on test order.
 */
// A cold dev server compiles each route on first use, which is slower than the default 5 s.
describe.skipIf(!process.env.SUPABASE_INTEGRATION)("upload pipeline (real stack)", { timeout: 60_000 }, () => {
  it("posts a photo from an intent, derives the type itself, and answers a replay with the same post", async () => {
    const phone = await join();
    const { postId } = await uploadedIntent(phone);

    const first = await phone.call<{ id: string }>("POST", "/api/posts", { postId, caption: "Akad", type: "video" });
    expect(first.status).toBe(201);
    expect(first.body.data!.id).toBe(postId);
    expect((await phone.call<{ id: string }>("POST", "/api/posts", { postId })).body.data!.id).toBe(postId);

    const wall = await fetch(`${BASE}/api/posts`).then((r) => r.json());
    const post = wall.data.posts.find((p: { id: string }) => p.id === postId);
    expect(post).toMatchObject({ type: "photo", caption: "Akad" });
  });

  it("refuses a post whose files never arrived", async () => {
    const phone = await join();
    const intent = await phone.call<Intent>("POST", "/api/uploads", { files: photoFiles() });
    const res = await phone.call("POST", "/api/posts", { postId: intent.body.data!.postId });
    expect(res.status).toBe(400);
    expect(res.body.error!.code).toBe("upload_incomplete");
  });

  it("refuses files that are not what they claim to be, even at the declared size and type", async () => {
    const phone = await join();
    const intent = await phone.call<Intent>("POST", "/api/uploads", { files: photoFiles() });
    const { postId, uploads } = intent.body.data!;
    expect((await put(uploads.find((u) => u.role === "main")!.url, 3000, "image/jpeg", false)).status).toBe(200);
    expect((await put(uploads.find((u) => u.role === "thumb")!.url, 1000)).status).toBe(200);
    const res = await phone.call("POST", "/api/posts", { postId });
    expect(res.status).toBe(400);
    expect(res.body.error!.code).toBe("upload_incomplete");
  });

  it("makes storage refuse a file whose size or type differs from the signed one", async () => {
    const phone = await join();
    const intent = await phone.call<Intent>("POST", "/api/uploads", { files: photoFiles() });
    const main = intent.body.data!.uploads.find((u) => u.role === "main")!;
    expect((await put(main.url, 3500)).status).toBe(403);
    expect((await put(main.url, 3000, "text/html")).status).toBe(403);
  });

  it("does not let another guest post or cancel an intent", async () => {
    const owner = await join();
    const stranger = await join();
    const { postId } = await uploadedIntent(owner);
    expect((await stranger.call("POST", "/api/posts", { postId })).status).toBe(404);
    expect((await stranger.call("DELETE", `/api/uploads/${postId}`)).status).toBe(404);
  });

  it("will not cancel an intent that already became a post", async () => {
    const phone = await join();
    const { postId } = await uploadedIntent(phone);
    await phone.call("POST", "/api/posts", { postId });
    const res = await phone.call("DELETE", `/api/uploads/${postId}`);
    expect(res.status).toBe(409);
    expect(res.body.error!.code).toBe("already_posted");
  });

  it("cancels an unposted intent, and then it cannot be posted", async () => {
    const phone = await join();
    const { postId } = await uploadedIntent(phone);
    expect((await phone.call("DELETE", `/api/uploads/${postId}`)).status).toBe(200);
    expect((await phone.call("POST", "/api/posts", { postId })).status).toBe(410); // cancelled, not forgotten
  });

  it("keeps a cancelled upload counting against the hour", async () => {
    const phone = await join();
    const issued: string[] = [];
    for (let i = 0; i < POSTS_PER_HOUR; i++) {
      const res = await phone.call<Intent>("POST", "/api/uploads", { files: photoFiles() });
      expect(res.status).toBe(201);
      issued.push(res.body.data!.postId);
    }
    expect((await phone.call("DELETE", `/api/uploads/${issued[0]}`)).status).toBe(200);
    expect((await phone.call("POST", "/api/uploads", { files: photoFiles() })).status).toBe(429);
    expect((await phone.call("POST", "/api/posts", { postId: issued[0] })).status).toBe(410); // and it can no longer be posted
  });

  it("holds the limit under a burst of parallel requests", async () => {
    const phone = await join();
    const burst = await Promise.all(
      Array.from({ length: POSTS_PER_HOUR + 12 }, () => phone.call("POST", "/api/uploads", { files: photoFiles() })),
    );
    const statuses = burst.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(POSTS_PER_HOUR);
    expect(statuses.filter((s) => s === 429)).toHaveLength(12);
  });

  it("needs a session to upload or post", async () => {
    const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ files: photoFiles() }) });
    expect(res.status).toBe(401);
  });

  it(`stops the ${POSTS_PER_HOUR + 1}st post of the hour`, async () => {
    const phone = await join();
    for (let i = 0; i < POSTS_PER_HOUR; i++) {
      expect((await phone.call("POST", "/api/uploads", { files: photoFiles() })).status).toBe(201);
    }
    const over = await phone.call("POST", "/api/uploads", { files: photoFiles() });
    expect(over.status).toBe(429);
    expect(over.body.error!.code).toBe("rate_limited");
    expect((await phone.call("POST", "/api/posts", { wishText: "One more wish" })).status).toBe(429);
  });
});
