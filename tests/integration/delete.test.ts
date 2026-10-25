// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POSTS_PER_HOUR } from "@/lib/domain/limits";
import { BASE, JSON_HEADERS, join, uploadedIntent } from "../fixtures/phone";

/**
 * Deleting a post against the real stack (see uploads.test.ts for how to run it): ownership by
 * token, files removed with the row, and no refund of the hourly allowance.
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration
 */
type Wall = { data: { posts: { id: string; media: { url: string }[] }[] } };
const wall = (): Promise<Wall> => fetch(`${BASE}/api/posts`).then((r) => r.json());
const onWall = async (id: string) => (await wall()).data.posts.some((p) => p.id === id);

const wish = async (phone: Awaited<ReturnType<typeof join>>, text = "Selamat pengantin baru") =>
  (await phone.call<{ id: string }>("POST", "/api/posts", { wishText: text })).body.data!.id;

describe.skipIf(!process.env.SUPABASE_INTEGRATION)("delete a post (real stack)", { timeout: 60_000 }, () => {
  it("lets only the author's token delete, and says 403 to anyone else", async () => {
    const author = await join();
    const stranger = await join();
    const id = await wish(author);

    const refused = await stranger.call("DELETE", `/api/posts/${id}`);
    expect(refused).toMatchObject({ status: 403, body: { error: { code: "not_yours" } } });
    expect(await onWall(id)).toBe(true);

    const noSession = await fetch(`${BASE}/api/posts/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    expect(noSession.status).toBe(401);
    expect(await onWall(id)).toBe(true);

    expect((await author.call("DELETE", `/api/posts/${id}`)).status).toBe(200);
    expect(await onWall(id)).toBe(false);
    expect((await author.call("DELETE", `/api/posts/${id}`)).status).toBe(404);
  });

  it("removes the files with the row, and a replayed upload cannot bring the post back", async () => {
    const phone = await join();
    const { postId } = await uploadedIntent(phone);
    expect((await phone.call("POST", "/api/posts", { postId })).status).toBe(201);
    const url = (await wall()).data.posts.find((p) => p.id === postId)!.media[0]!.url;
    expect((await fetch(url)).status).toBe(200);

    expect((await phone.call("DELETE", `/api/posts/${postId}`)).status).toBe(200);

    expect(await onWall(postId)).toBe(false);
    expect((await fetch(url)).ok).toBe(false);
    expect((await phone.call("POST", "/api/posts", { postId })).status).toBe(410);
    expect(await onWall(postId)).toBe(false);
  });

  it("lists a guest's own posts only, and drops a deleted one", async () => {
    const phone = await join();
    const other = await join();
    const mine = await wish(phone);
    await wish(other);

    const list = await phone.call<{ id: string }[]>("GET", "/api/me/posts");
    expect(list.body.data!.map((p) => p.id)).toEqual([mine]);

    await phone.call("DELETE", `/api/posts/${mine}`);
    expect((await phone.call<unknown[]>("GET", "/api/me/posts")).body.data).toEqual([]);
  });

  it("does not refund the hourly allowance when a wish is deleted", async () => {
    const phone = await join();
    const first = await wish(phone, "Wish number 1");
    for (let n = 2; n <= POSTS_PER_HOUR; n++) await wish(phone, `Wish number ${n}`);

    expect((await phone.call("DELETE", `/api/posts/${first}`)).status).toBe(200);

    const next = await phone.call("POST", "/api/posts", { wishText: "One more please" });
    expect(next).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});
