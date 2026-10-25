import { beforeAll, describe, expect, it, vi } from "vitest";
import { validEnv } from "../../tests/fixtures/env";

const createClient = vi.hoisted(() => vi.fn(() => ({ marker: "client" })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { db } from "./db";

beforeAll(() => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v);
});

describe("db", () => {
  it("builds one service-role client for the whole server, without a browser session", () => {
    expect(db()).toBe(db());
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      validEnv.NEXT_PUBLIC_SUPABASE_URL,
      validEnv.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});
