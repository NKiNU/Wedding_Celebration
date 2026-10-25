import { z } from "zod";
import { nameProblem, normalizeName } from "./domain/names";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_PASSCODE: z.string().min(8),
  DEVICE_TOKEN_PEPPER: z.string().min(32),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  NEXT_PUBLIC_MEDIA_BASE_URL: z.url(),
  EVENT_SLUG: z.string().min(1),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

/** Parse env vars, failing fast with every offending variable name. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const names = result.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid environment: ${names}`);
}

const nameSchema = z
  .string()
  .transform(normalizeName)
  .superRefine((name, ctx) => {
    const problem = nameProblem(name);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const createGuestBody = z.object({ name: nameSchema });

export const activateGuestBody = z.object({ guestId: z.uuid() });
