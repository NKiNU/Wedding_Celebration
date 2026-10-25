import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "./env";

let client: SupabaseClient<Database> | undefined;

/** Service-role client: it bypasses RLS, so call it only for work the server has authorized. */
export function db(): SupabaseClient<Database> {
  return (client ??= createClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}
