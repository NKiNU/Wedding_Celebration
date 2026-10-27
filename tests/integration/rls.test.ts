// @vitest-environment node
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * What an anonymous visitor can reach in Postgres, straight from the browser's key, plus the admin
 * login throttle under a parallel burst. Needs `npx supabase start` and `.env.local`:
 *   SUPABASE_INTEGRATION=1 npx vitest run tests/integration/rls.test.ts
 * Against hosted Supabase, point `.env.local` at the project before the launch check.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // the variables may already be in the environment (CI)
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
let anon: SupabaseClient;
let service: SupabaseClient;
const newAnon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, noSession);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!process.env.SUPABASE_INTEGRATION)("anon access and admin throttle (real stack)", { timeout: 60_000 }, () => {
  beforeAll(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, noSession);
    service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
  });

  it("cannot read the tables that hold secrets or private state", async () => {
    for (const table of ["guests", "upload_intents", "admin_attempts", "wish_log"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error, table).not.toBeNull();
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("sees guest names only through the view, never a token hash", async () => {
    const { data, error } = await anon.from("public_guests").select("*").limit(5);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) expect(Object.keys(row).sort()).toEqual(["event_id", "id", "name"]);
  });

  it("cannot write to any table", async () => {
    const { data: event } = await service.from("events").select("id").limit(1).single();
    const attempts = [
      anon.from("guests").insert({ event_id: event!.id, name: "Intruder", token_hash: "x" }),
      anon.from("posts").insert({ event_id: event!.id, guest_id: event!.id, type: "wish", wish_text: "hello" }),
      anon.from("post_media").insert({ post_id: event!.id, position: 0, kind: "image", path: "x", bytes: 1, mime: "image/jpeg" }),
      anon.from("events").update({ uploads_open: false }).eq("id", event!.id),
      anon.from("posts").delete().eq("event_id", event!.id),
      anon.from("public_guests").insert({ event_id: event!.id, name: "Intruder" }),
      anon.from("public_guests").update({ name: "Renamed" }).eq("event_id", event!.id),
    ];
    for (const attempt of attempts) expect((await attempt).error).not.toBeNull();
    expect((await service.from("events").select("uploads_open").eq("id", event!.id).single()).data!.uploads_open).toBe(true);
  });

  it("never sees a hidden post", async () => {
    const { data: post } = await service.from("posts").select("id").eq("hidden", false).limit(1).single();
    try {
      expect((await anon.from("posts").select("id").eq("id", post!.id)).data).toHaveLength(1);
      await service.from("posts").update({ hidden: true }).eq("id", post!.id);
      expect((await anon.from("posts").select("id").eq("id", post!.id)).data).toEqual([]);
      expect((await anon.from("post_media").select("id").eq("post_id", post!.id)).data).toEqual([]);
    } finally {
      await service.from("posts").update({ hidden: false }).eq("id", post!.id);
    }
  });

  it("cannot call the service-only functions, and the throttle table stays untouched", async () => {
    const ip = `anon-${Math.random().toString(36).slice(2)}`;
    const throttled = await anon.rpc("admin_login_attempt", { p_ip_hash: ip, p_since: new Date().toISOString(), p_max: 5 });
    expect(throttled.error?.code).toBe("42501");
    const { count } = await service.from("admin_attempts").select("*", { count: "exact", head: true }).eq("ip_hash", ip);
    expect(count).toBe(0);

    // Full argument lists: a partial one matches no function (PGRST202) and would pass for the wrong reason.
    const id = "00000000-0000-4000-8000-000000000000";
    const since = new Date().toISOString();
    for (const [fn, args] of [
      ["admin_login_clear", { p_ip_hash: ip }],
      ["create_wish", { p_event_id: id, p_guest_id: id, p_text: "hi", p_since: since, p_max_posts: 30, p_max_bytes: 1 }],
      ["create_upload_intent", { p_post_id: id, p_event_id: id, p_guest_id: id, p_files: [], p_expires_at: since, p_since: since, p_max_posts: 30, p_max_bytes: 1 }],
      ["create_post_from_intent", { p_post_id: id, p_guest_id: id, p_type: "wish", p_caption: null, p_media: [] }],
      ["guest_usage", { p_guest_id: id, p_since: since }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error?.code, fn).toBe("42501");
    }
    expect((await anon.rpc("wall_counts", { e: id })).error).toBeNull(); // the one public function
  });

  it("lets anon listen on the wall's private topic but never send on it", async () => {
    const { data: event } = await service.from("events").select("id").limit(1).single();
    const { data: post } = await service.from("posts").select("id").eq("hidden", false).limit(1).single();
    const topic = `wall:${event!.id}`;
    const clients = [newAnon(), newAnon()];
    const join = (client: SupabaseClient, onHidden?: (id: string) => void) =>
      new Promise<RealtimeChannel>((resolve, reject) => {
        const channel = client.channel(topic, { config: { private: true } });
        if (onHidden) channel.on("broadcast", { event: "post_hidden" }, ({ payload }) => onHidden(String(payload.id)));
        channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolve(channel);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(err ?? new Error(status));
        });
      });
    const heard: string[] = [];
    try {
      await join(clients[0]!, (id) => heard.push(id));
      const attacker = await join(clients[1]!);

      await attacker.send({ type: "broadcast", event: "post_hidden", payload: { id: "forged" } });
      await sleep(1500);
      expect(heard).not.toContain("forged");

      await service.from("posts").update({ hidden: true }).eq("id", post!.id); // the database's own broadcast
      for (let i = 0; i < 50 && !heard.includes(post!.id); i++) await sleep(100);
      expect(heard).toContain(post!.id);
    } finally {
      await service.from("posts").update({ hidden: false }).eq("id", post!.id);
      await Promise.all(clients.map((c) => c.removeAllChannels()));
    }
  });

  describe("admin_login_attempt", () => {
    const ip = `itest-${Math.random().toString(36).slice(2)}`;
    const attempt = () =>
      service.rpc("admin_login_attempt", { p_ip_hash: ip, p_since: new Date(Date.now() - 15 * 60_000).toISOString(), p_max: 5 });
    afterAll(async () => void (await service.from("admin_attempts").delete().eq("ip_hash", ip)));

    it("lets exactly five of eight parallel guesses through, then refuses with PT429", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, attempt));
      expect(results.filter((r) => r.error === null)).toHaveLength(5);
      expect(results.filter((r) => r.error?.code === "PT429")).toHaveLength(3);
    });

    it("forgets the caller after a correct passcode", async () => {
      expect((await attempt()).error?.code).toBe("PT429");
      expect((await service.rpc("admin_login_clear", { p_ip_hash: ip })).error).toBeNull();
      expect((await attempt()).error).toBeNull();
    });
  });
});
