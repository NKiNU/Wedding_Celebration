import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type WallEvents = {
  /** A post was added or changed (unhide arrives as a change). The payload lacks media, so refetch. */
  onChange: () => void;
  /** A post was deleted or hidden; only its id is known. */
  onRemove: (id: string) => void;
  /** The socket (re)connected: anything missed while it was down needs a refetch. */
  onConnected: () => void;
};

export type SubscribeToWall = (eventId: string, events: WallEvents) => () => void;

/**
 * Live wall updates with the anon key: Postgres Changes on `posts` (RLS shows anon only visible
 * rows) plus the `post_hidden` broadcast the database sends when a post is hidden.
 * ponytail: no event_id filter, because DELETE events cannot be filtered; one wedding per
 * deployment (docs/adr/002) means every row is ours anyway.
 */
let shared: SupabaseClient | undefined;
const anonClient = () =>
  (shared ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

export const subscribeToWall: SubscribeToWall = (eventId, events) => {
  const client = anonClient(); // one per page: StrictMode and remounts must not pile up auth clients
  const channel = client
    .channel(`wall:${eventId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, (change) => {
      const old = change.old as { id?: string };
      if (change.eventType === "DELETE" && old.id) events.onRemove(old.id);
      else events.onChange();
    })
    .on("broadcast", { event: "post_hidden" }, ({ payload }) => {
      const id = (payload as { id?: unknown } | null)?.id;
      if (typeof id === "string") events.onRemove(id);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") events.onConnected();
    });
  return () => void client.removeChannel(channel);
};
