// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POSTS_PER_HOUR } from "@/lib/domain/limits";

/**
 * The upload pipeline against the real stack: `npm run dev`, `supabase start`, a seeded database,
 * and R2_* pointing at an S3-compatible bucket (local Supabase Storage, see .env.example).
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration
 * Each test joins as its own guest, so nothing depends on test order.
 */
const BASE = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3000";
const JSON_HEADERS = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

type Api<T = Record<string, unknown>> = { status: number; body: { ok: boolean; data?: T; error?: { code: string } } };

/** A phone: it keeps the cookies the server sets. */
async function join(): Promise<{ call: <T = Record<string, unknown>>(method: string, path: string, body?: unknown) => Promise<Api<T>> }> {
  let cookie = "";
  const call = async <T,>(method: string, path: string, body?: unknown): Promise<Api<T>> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...JSON_HEADERS, ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
    if (set.length > 0) cookie = [...new Map([...cookie.split("; "), ...set].filter(Boolean).map((c) => [c.split("=")[0], c])).values()].join("; ");
    return { status: res.status, body: await res.json() };
  };
  const name = `Int ${Math.random().toString(36).slice(2, 8)}`;
  expect((await call("POST", "/api/guests", { name })).status).toBe(201);
  return { call };
}

const photoFiles = (bytes = 3000) => [
  { role: "main", position: 0, mime: "image/jpeg", bytes, width: 2048, height: 1536 },
  { role: "thumb", position: 0, mime: "image/jpeg", bytes: 1000 },
];
type Intent = { postId: string; uploads: { role: string; url: string }[] };

const put = (url: string, bytes: number, type = "image/jpeg") =>
  fetch(url, { method: "PUT", headers: { "content-type": type }, body: new Uint8Array(bytes).fill(7) });

/** Issues an intent and uploads exactly what it declared. */
async function uploadedIntent(phone: Awaited<ReturnType<typeof join>>, files = photoFiles()) {
  const intent = await phone.call<Intent>("POST", "/api/uploads", { files });
  expect(intent.status).toBe(201);
  for (const target of intent.body.data!.uploads) {
    const file = files.find((f) => f.role === target.role)!;
    expect((await put(target.url, file.bytes)).status).toBe(200);
  }
  return intent.body.data!;
}

describe.skipIf(!process.env.SUPABASE_INTEGRATION)("upload pipeline (real stack)", () => {
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
    expect((await phone.call("POST", "/api/posts", { postId })).status).toBe(404);
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
