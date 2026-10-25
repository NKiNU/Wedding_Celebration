import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";
import { fakeDb } from "../../tests/fixtures/supabase";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", () => ({ db: () => mocks.db }));

import { getEvent } from "./event";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

describe("getEvent", () => {
  it("loads the event this deployment serves, by its slug", async () => {
    const event = { id: "e1", groom_name: "Groom", bride_name: "Bride", header_message: "Hi", uploads_open: true };
    const { db, calls } = fakeDb([{ data: event, error: null }]);
    mocks.db = db;

    expect(await getEvent()).toEqual(event);
    expect(calls.find((c) => c.method === "eq")!.args).toEqual(["slug", "demo"]);
  });

  it("fails loudly when EVENT_SLUG matches no event", async () => {
    mocks.db = fakeDb([{ data: null, error: { code: "PGRST116", message: "no rows" } }]).db;
    await expect(getEvent()).rejects.toThrow(/demo/);
  });
});
