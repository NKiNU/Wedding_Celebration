import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;
const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  status: null as null | ((s: string) => void),
  removeChannel: vi.fn(),
  channelName: "",
}));

vi.mock("@supabase/supabase-js", () => {
  const channel = {
    on(type: string, _filter: unknown, handler: Handler) {
      mocks.handlers[type] = handler;
      return channel;
    },
    subscribe(cb: (s: string) => void) {
      mocks.status = cb;
      return channel;
    },
  };
  return {
    createClient: () => ({
      channel: (name: string) => {
        mocks.channelName = name;
        return channel;
      },
      removeChannel: mocks.removeChannel,
    }),
  };
});

import { subscribeToWall } from "./realtime";

const events = { onChange: vi.fn(), onRemove: vi.fn(), onConnected: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

describe("subscribeToWall", () => {
  it("joins the public wall topic the hide trigger broadcasts on", () => {
    subscribeToWall("e1", events);
    expect(mocks.channelName).toBe("wall:e1");
  });

  it("refetches on inserts and updates, and removes by id on deletes", () => {
    subscribeToWall("e1", events);
    mocks.handlers.postgres_changes!({ eventType: "INSERT", old: {} });
    mocks.handlers.postgres_changes!({ eventType: "UPDATE", old: {} });
    expect(events.onChange).toHaveBeenCalledTimes(2);

    mocks.handlers.postgres_changes!({ eventType: "DELETE", old: { id: "p1" } });
    expect(events.onRemove).toHaveBeenCalledWith("p1");
  });

  it("treats a delete without an id as a change to refetch", () => {
    subscribeToWall("e1", events);
    mocks.handlers.postgres_changes!({ eventType: "DELETE", old: {} });
    expect(events.onChange).toHaveBeenCalled();
    expect(events.onRemove).not.toHaveBeenCalled();
  });

  it("treats a hide broadcast as a hint to refetch, never as a removal: anyone can send one", () => {
    subscribeToWall("e1", events);
    mocks.handlers.broadcast!({ payload: { id: "p2" } });
    mocks.handlers.broadcast!({ payload: null });
    expect(events.onChange).toHaveBeenCalledTimes(2);
    expect(events.onRemove).not.toHaveBeenCalled();
  });

  it("reports each (re)connection, and cleans up", () => {
    const stop = subscribeToWall("e1", events);
    mocks.status!("CHANNEL_ERROR");
    expect(events.onConnected).not.toHaveBeenCalled();
    mocks.status!("SUBSCRIBED");
    expect(events.onConnected).toHaveBeenCalledTimes(1);
    stop();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });
});
