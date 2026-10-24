/** A complete, valid set of env vars for tests. */
export const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  ADMIN_PASSCODE: "letmein-123",
  DEVICE_TOKEN_PEPPER: "p".repeat(32),
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "wedding",
  NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.example.com",
  EVENT_SLUG: "demo",
  CRON_SECRET: "c".repeat(16),
};
