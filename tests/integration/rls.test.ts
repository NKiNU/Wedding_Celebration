// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "../fixtures/anon";
import { join } from "../fixtures/phone";

/**
 * What the public anon key can and cannot do against the real database (see uploads.test.ts for how
 * to run the integration tests). Every denial has a positive control: the same call with the
 * service role must get past the permission check, so a wrong argument name cannot pass as "denied".
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration/rls.test.ts
 */
const DENIED = "42501";
const NOT_FOUND = "PGRST202";
const rnd = () => Math.random().toString(36).slice(2, 10);
const since = () => new Date(Date.now() - 3_600_000).toISOString();
const live = Boolean(process.env.SUPABASE_INTEGRATION);
// Built only for an integration run: without the Supabase env vars (CI) the fixture throws.
let anon: SupabaseClient;
let service: SupabaseClient;
beforeAll(() => {
  if (!live) return;
  anon = anonClient();
  service = serviceClient();
});

type Args = Record<string, unknown>;

// Real-shaped arguments for every locked-down function (matching the migrations' signatures).
const locked: { fn: string; args: Args }[] = [
  {
    fn: "create_post_from_intent",
    args: { p_post_id: randomUUID(), p_guest_id: randomUUID(), p_type: "photo", p_caption: null, p_media: [{ position: 0 }] },
  },
  {
    fn: "create_upload_intent",
    args: {
      p_post_id: randomUUID(), p_event_id: randomUUID(), p_guest_id: randomUUID(), p_files: [],
      p_expires_at: new Date(Date.now() + 3_600_000).toISOString(), p_since: since(),
      p_max_posts: 30, p_max_bytes: 1000, p_max_event_bytes: 1000,
    },
  },
  {
    fn: "create_wish",
    args: { p_event_id: randomUUID(), p_guest_id: randomUUID(), p_text: "Selamat pengantin baru", p_since: since(), p_max_posts: 30, p_max_bytes: 1000 },
  },
  { fn: "guest_usage", args: { p_guest_id: randomUUID(), p_since: since() } },
  { fn: "admin_login_attempt", args: { p_ip_hash: `rls_${rnd()}`, p_since: since(), p_max: 5 } },
  { fn: "admin_login_clear", args: { p_ip_hash: `rls_${rnd()}` } },
  { fn: "rate_limit_hit", args: { p_scope: `test_${rnd()}`, p_key: `rls_${rnd()}`, p_window_s: 3600, p_max: 5 } },
];

const touchedAdmin = new Set<string>();
const touchedRate = new Set<string>();

afterAll(async () => {
  if (!live) return;
  for (const ip of touchedAdmin) await service.from("admin_attempts").delete().eq("ip_hash", ip);
  for (const key of touchedRate) await service.from("rate_attempts").delete().eq("key_hash", key);
});

describe.skipIf(!live)("database permissions (real stack)", { timeout: 60_000 }, () => {
  describe("tables the anon key must not touch", () => {
    const secret = ["guests", "upload_intents", "wish_log", "admin_attempts", "rate_attempts"];

    it.each(secret)("refuses a select on %s with permission denied", async (table) => {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error?.code).toBe(DENIED);
      expect(data).toBeNull();
      // Control: the service role reads the same table.
      expect((await service.from(table).select("*").limit(1)).error).toBeNull();
    });

    it.each(secret)("refuses an insert into %s", async (table) => {
      const { error } = await anon.from(table).insert({});
      expect(error?.code).toBe(DENIED);
    });

    it("refuses writes on the tables it can read", async () => {
      expect((await anon.from("posts").update({ hidden: true }).eq("id", randomUUID())).error?.code).toBe(DENIED);
      expect((await anon.from("posts").delete().eq("id", randomUUID())).error?.code).toBe(DENIED);
      expect((await anon.from("events").update({ uploads_open: false }).eq("slug", "x")).error?.code).toBe(DENIED);
      expect((await anon.from("post_media").delete().eq("id", randomUUID())).error?.code).toBe(DENIED);
    });

    it("cannot download the guest list through public_guests, which still never has token_hash", async () => {
      await join(); // make sure there is at least one guest
      const names = await anon.from("public_guests").select("id, event_id, name").limit(5);
      expect(names.error?.code).toBe(DENIED);
      expect(names.data).toBeNull();

      // The service role still reads it, with only the three safe columns.
      const all = await service.from("public_guests").select("*").limit(1);
      expect(all.error).toBeNull();
      expect(all.data!.length).toBeGreaterThan(0);
      expect(Object.keys(all.data![0]!).sort()).toEqual(["event_id", "id", "name"]);
    });

    it("refuses writes through the public_guests view", async () => {
      const event = await anon.from("events").select("id").limit(1).single();
      expect(event.error).toBeNull();
      const id = randomUUID();
      expect((await anon.from("public_guests").insert({ id, event_id: event.data!.id, name: "View Writer" })).error?.code).toBe(DENIED);
      expect((await anon.from("public_guests").update({ name: "Renamed" }).eq("id", id)).error?.code).toBe(DENIED);
      expect((await anon.from("public_guests").delete().eq("id", id)).error?.code).toBe(DENIED);
      expect((await service.from("guests").select("id").eq("id", id)).data).toEqual([]);
    });
  });

  describe("hidden posts", () => {
    it("are invisible to anon (post and media) and come back when unhidden", async () => {
      const phone = await join();
      const id = (await phone.call<{ id: string }>("POST", "/api/posts", { wishText: "Hidden wish check" })).body.data!.id;
      // A media row for the same post, written by the service role, to prove post_media follows the post.
      const media = await service
        .from("post_media")
        .insert({ post_id: id, position: 0, kind: "image", path: `rls/${id}/0.jpg`, bytes: 1, mime: "image/jpeg" })
        .select("id")
        .single();
      expect(media.error).toBeNull();

      try {
        expect((await anon.from("posts").select("id").eq("id", id)).data).toHaveLength(1);
        expect((await anon.from("post_media").select("id").eq("post_id", id)).data).toHaveLength(1);

        expect((await service.from("posts").update({ hidden: true }).eq("id", id)).error).toBeNull();

        expect(await anon.from("posts").select("id").eq("id", id)).toMatchObject({ error: null, data: [] });
        expect(await anon.from("post_media").select("id").eq("post_id", id)).toMatchObject({ error: null, data: [] });
        // Asking for hidden rows explicitly does not help either.
        expect((await anon.from("posts").select("id").eq("hidden", true).limit(50)).data).toEqual([]);
        // The service role still sees it, so "empty" is the filter and not a broken query.
        expect((await service.from("posts").select("id").eq("id", id)).data).toHaveLength(1);
      } finally {
        await service.from("posts").update({ hidden: false }).eq("id", id);
        await service.from("post_media").delete().eq("post_id", id);
        await service.from("posts").delete().eq("id", id);
      }
    });
  });

  describe("security definer functions", () => {
    it.each(locked)("$fn: anon is denied, the service role gets past the permission check", async ({ fn, args }) => {
      const denied = await anon.rpc(fn, args);
      expect(denied.error?.code).toBe(DENIED);
      expect(denied.data).toBeNull();

      if (fn === "admin_login_attempt") touchedAdmin.add(args.p_ip_hash as string);
      if (fn === "rate_limit_hit") touchedRate.add(args.p_key as string);
      const allowed = await service.rpc(fn, args);
      // Succeeds, or fails on a domain rule (PT code, foreign key, ...), but never on permission or lookup.
      expect([DENIED, NOT_FOUND]).not.toContain(allowed.error?.code);
    });

    it("broadcast_post_hidden is a trigger function that nobody can call over rpc", async () => {
      // PostgREST only exposes functions that are not trigger functions, so both clients get "not
      // found". EXECUTE is also revoked from public/anon/authenticated in 0001, and the hidden-post
      // test above runs it for real as the posts trigger.
      for (const client of [anon, service]) {
        const res = await client.rpc("broadcast_post_hidden", {});
        expect(res.data).toBeNull();
        expect(res.error?.code).toBe(NOT_FOUND);
      }
    });
  });

  describe("what anon may do", () => {
    it("reads the filter counts through wall_counts", async () => {
      const event = await anon.from("events").select("id").limit(1).single();
      expect(event.error).toBeNull();
      const { data, error } = await anon.rpc("wall_counts", { e: event.data!.id });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0]).toEqual({
        all_count: expect.any(Number),
        photos: expect.any(Number),
        videos: expect.any(Number),
        wishes: expect.any(Number),
      });
    });
  });

  describe("throttles hold under a parallel burst", () => {
    const outcome = (r: { error: { code?: string } | null }) => (r.error === null ? "ok" : r.error.code);

    it("admin_login_attempt lets exactly p_max of 12 parallel attempts through", async () => {
      const ip = `rls_burst_${rnd()}`;
      touchedAdmin.add(ip);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => service.rpc("admin_login_attempt", { p_ip_hash: ip, p_since: since(), p_max: 5 })),
      );
      const codes = results.map(outcome);
      expect(codes.filter((c) => c === "ok")).toHaveLength(5);
      expect(codes.filter((c) => c === "PT429")).toHaveLength(7);
      expect((await service.from("admin_attempts").select("ip_hash").eq("ip_hash", ip)).data).toHaveLength(5);
    });

    it("rate_limit_hit lets exactly p_max of 10 parallel hits through", async () => {
      const key = `rls_burst_${rnd()}`;
      const scope = `test_${rnd()}`;
      touchedRate.add(key);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.rpc("rate_limit_hit", { p_scope: scope, p_key: key, p_window_s: 3600, p_max: 4 })),
      );
      const codes = results.map(outcome);
      expect(codes.filter((c) => c === "ok")).toHaveLength(4);
      expect(codes.filter((c) => c === "PT429")).toHaveLength(6);
      expect((await service.from("rate_attempts").select("key_hash").eq("key_hash", key)).data).toHaveLength(4);
    });

    it("rate_limit_hit cleans only its own key's old rows", async () => {
      const scope = `test_${rnd()}`;
      const [mine, other] = [`rls_own_${rnd()}`, `rls_other_${rnd()}`];
      touchedRate.add(mine).add(other);
      const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
      const seeded = await service.from("rate_attempts").insert([
        { scope, key_hash: mine, at: old },
        { scope, key_hash: other, at: old },
      ]);
      expect(seeded.error).toBeNull();

      expect((await service.rpc("rate_limit_hit", { p_scope: scope, p_key: mine, p_window_s: 3600, p_max: 3 })).error).toBeNull();

      const rows = await service.from("rate_attempts").select("key_hash, at").eq("scope", scope);
      // Mine: the old row is gone, the new hit is there. Other: its old row is left for the sweep.
      const ages = (key: string) => rows.data!.filter((r) => r.key_hash === key).map((r) => Date.now() - Date.parse(r.at));
      expect(ages(mine)).toHaveLength(1);
      expect(ages(mine)[0]).toBeLessThan(3_600_000);
      expect(ages(other)).toHaveLength(1);
      expect(ages(other)[0]).toBeGreaterThan(3_600_000);
    });
  });

  describe("on an event of its own", () => {
    // A fresh event, so the event-wide numbers (stored bytes, counts) start at zero whatever the
    // other tests left behind. Deleting it cascades to its guests, intents, posts and media.
    let eventId: string;
    let guestId: string;
    beforeAll(async () => {
      const event = await service
        .from("events")
        .insert({ slug: `rls-${rnd()}`, groom_name: "Test", bride_name: "Event" })
        .select("id")
        .single();
      expect(event.error).toBeNull();
      eventId = event.data!.id;
      const guest = await service
        .from("guests")
        .insert({ event_id: eventId, name: "Cap Tester", token_hash: `rls_${randomUUID()}` })
        .select("id")
        .single();
      expect(guest.error).toBeNull();
      guestId = guest.data!.id;
    });
    afterAll(async () => {
      if (eventId) await service.from("events").delete().eq("id", eventId);
    });

    const CAP = 1000;
    const intent = (postId: string, bytes: number) =>
      service.rpc("create_upload_intent", {
        p_post_id: postId, p_event_id: eventId, p_guest_id: guestId,
        p_files: [{ role: "main", position: 0, key: `rls/${postId}/0.jpg`, mime: "image/jpeg", bytes }],
        p_expires_at: new Date(Date.now() + 3_600_000).toISOString(), p_since: since(),
        p_max_posts: 30, p_max_bytes: 1_000_000, p_max_event_bytes: CAP,
      });
    const post = (postId: string, bytes: number) =>
      service.rpc("create_post_from_intent", {
        p_post_id: postId, p_guest_id: guestId, p_type: "photo", p_caption: null,
        p_media: [{ position: 0, kind: "image", path: `rls/${postId}/0.jpg`, bytes, mime: "image/jpeg" }],
      });

    it("the storage cap counts posted bytes (hidden too) but not unposted reservations", async () => {
      const [a, b] = [randomUUID(), randomUUID()];
      // Two reservations of 600 under a 1000 cap: both pass, since nothing is stored yet.
      expect((await intent(a, 600)).error).toBeNull();
      expect((await intent(b, 600)).error).toBeNull();
      // One request bigger than the cap on its own is refused.
      expect((await intent(randomUUID(), CAP + 1)).error?.code).toBe("PT507");

      // Once a is posted its 600 bytes are stored: 500 more is over the cap, 400 fits.
      expect((await post(a, 600)).error).toBeNull();
      expect((await intent(randomUUID(), 500)).error?.code).toBe("PT507");
      expect((await intent(randomUUID(), 400)).error).toBeNull();

      // A hidden post still occupies storage.
      expect((await service.from("posts").update({ hidden: true }).eq("id", a)).error).toBeNull();
      expect((await intent(randomUUID(), 500)).error?.code).toBe("PT507");
    });

    it("wall_counts leaves out a hidden post", async () => {
      const wish = await service
        .from("posts")
        .insert({ event_id: eventId, guest_id: guestId, type: "wish", wish_text: "Counted wish" })
        .select("id")
        .single();
      expect(wish.error).toBeNull();
      const wishes = async () => {
        const res = await anon.rpc("wall_counts", { e: eventId });
        expect(res.error).toBeNull();
        const viaService = await service.rpc("wall_counts", { e: eventId });
        expect(viaService.data).toEqual(res.data); // the explicit filter matches what RLS does for anon
        return (res.data as { wishes: number }[])[0]!.wishes;
      };

      expect(await wishes()).toBe(1);
      expect((await service.from("posts").update({ hidden: true }).eq("id", wish.data!.id)).error).toBeNull();
      expect(await wishes()).toBe(0);
      expect((await service.from("posts").update({ hidden: false }).eq("id", wish.data!.id)).error).toBeNull();
      expect(await wishes()).toBe(1);
    });
  });
});
