// Supabase clients for the integration tests that talk to the database directly (rls.test.ts):
// the public anon key (what a guest's browser holds) and the service role (what the server holds).
// Vitest does not load .env.local by itself, so it is read here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const env = { ...loadEnv("", process.cwd(), ""), ...process.env };

const make = (key: string | undefined): SupabaseClient => {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and the Supabase keys must be set (.env.local)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const anonClient = () => make(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const serviceClient = () => make(env.SUPABASE_SERVICE_ROLE_KEY);
