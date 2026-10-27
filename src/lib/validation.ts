import { z } from "zod";
import {
  CAPTION_MAX,
  MAX_PHOTOS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  WISH_MAX,
  WISH_MIN,
} from "./domain/limits";
import { nameProblem, normalizeName } from "./domain/names";
import { qrProblem, uploadProblem } from "./domain/uploads";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

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
  // Dev only: any S3-compatible endpoint (local Supabase Storage). `.env.example` ships them empty.
  R2_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  R2_REGION: z.preprocess(emptyToUndefined, z.string().min(1).default("auto")),
  NEXT_PUBLIC_MEDIA_BASE_URL: z.url(),
  EVENT_SLUG: z.string().min(1),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

/** Parse env vars, failing fast with every offending variable name. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    // The dev endpoint would send guest uploads to whatever store it names. `next start` and a
    // Vercel production deploy both count as production; a local `npm start` against local storage
    // opts in with ALLOW_DEV_R2_ENDPOINT=1.
    const production = source.NODE_ENV === "production" || source.VERCEL_ENV === "production";
    if (result.data.R2_ENDPOINT && production && source.ALLOW_DEV_R2_ENDPOINT !== "1") {
      throw new Error("Invalid environment: R2_ENDPOINT must not be set in production");
    }
    return result.data;
  }
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

const uploadFile = z.object({
  role: z.enum(["main", "thumb", "poster"]),
  position: z.int().min(0).max(MAX_PHOTOS - 1),
  mime: z.string().max(100),
  bytes: z.int().positive().max(MAX_VIDEO_BYTES),
  width: z.int().positive().max(20_000).optional(),
  height: z.int().positive().max(20_000).optional(),
  durationS: z.number().positive().max(MAX_VIDEO_SECONDS).optional(),
});

/** POST /api/uploads: the files a guest wants to send. Keys and the post type are the server's. */
export const createUploadBody = z
  .object({ files: z.array(uploadFile).min(1).max(MAX_PHOTOS * 2) })
  .superRefine(({ files }, ctx) => {
    const problem = uploadProblem(files);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** The `files` column of an upload intent, as the server stored it. */
export const storedFiles = z.array(uploadFile.extend({ key: z.string().min(1) }));

const caption = z
  .string()
  .trim()
  .max(CAPTION_MAX, `Captions can be up to ${CAPTION_MAX} characters.`)
  .optional()
  .transform((c) => c || null);

/** POST /api/posts: a wish, or the post an upload intent was issued for. Never a type or author. */
export const createPostBody = z
  .object({
    postId: z.uuid().optional(),
    caption,
    // Counted in code points like Postgres char_length: two emoji are 4 UTF-16 units but 2 characters.
    wishText: z
      .string()
      .trim()
      .refine((t) => [...t].length >= WISH_MIN, `A wish needs at least ${WISH_MIN} characters.`)
      .refine((t) => [...t].length <= WISH_MAX, `A wish can be up to ${WISH_MAX} characters.`)
      .optional(),
  })
  .refine((b) => (b.postId === undefined) !== (b.wishText === undefined), "Send a wish or a post.");

export const postIdParam = z.uuid();

/** Where a guest was headed before the welcome screen (`/?next=`): a post link only, so it cannot be an open redirect. */
export const nextParam = z.string().refine((v) => v.startsWith("/p/") && postIdParam.safeParse(v.slice(3)).success);

export const adminLoginBody = z.object({ passcode: z.string().min(1).max(200) });

const field = (max: number) => z.string().trim().max(max);

/** PATCH /api/admin/event: any subset of the editable fields; at least one. */
export const updateEventBody = z
  .object({
    groomName: field(40).min(1),
    brideName: field(40).min(1),
    headerMessage: field(120),
    qrAccountName: field(80),
    qrBank: field(60),
    uploadsOpen: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change.");

/** POST /api/admin/qr: the QR image the admin is about to upload. */
export const qrPresignBody = z
  .object({ mime: z.string().max(100), bytes: z.int().positive() })
  .superRefine(({ mime, bytes }, ctx) => {
    const problem = qrProblem(mime, bytes);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** PUT /api/admin/qr: the key the presign call returned, now uploaded. */
export const qrConfirmBody = z.object({ key: z.string().min(1).max(200) });

export const hideBody = z.object({ hidden: z.boolean() });
