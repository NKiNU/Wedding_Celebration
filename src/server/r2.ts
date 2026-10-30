import "server-only";
import { AwsClient, AwsV4Signer } from "aws4fetch";
import { PRESIGN_EXPIRES_S } from "@/lib/domain/limits";
import { env } from "./env";

/** The slice of R2 the app uses. Services depend on this type so tests can swap in a fake. */
export type R2 = {
  /** A URL that accepts a PUT of exactly `bytes` bytes of `mime` to `key`, for a few minutes. */
  presignPut(key: string, mime: string, bytes: number): Promise<string>;
  /**
   * Size and type of a stored object, or null when it does not exist. `overridden` is true when
   * the uploader slipped in Content-Disposition or Content-Encoding (unsigned headers are stored
   * and served back), which would let a guest name or re-encode what the media domain serves.
   */
  head(key: string): Promise<{ bytes: number; mime: string; overridden: boolean } | null>;
  /** The first bytes of a stored object (at most `PEEK_BYTES`), or null when it does not exist. */
  peek(key: string): Promise<Uint8Array | null>;
  /** A whole small object, or null when it does not exist. Throws when it is larger than `maxBytes`. */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  deleteMany(keys: readonly string[]): Promise<void>;
  /**
   * Asks the media domain's CDN to forget these keys, so a deleted photo stops being served from
   * cache. Called after `deleteMany`; a failure is logged and never blocks the delete, but the
   * delete response waits for it, so an implementation must time out within a few seconds.
   */
  purge(keys: readonly string[]): Promise<void>;
};

export const PEEK_BYTES = 16;

const objectUrl = (key: string) => {
  const { R2_ENDPOINT, R2_ACCOUNT_ID, R2_BUCKET } = env();
  const base = R2_ENDPOINT?.replace(/\/$/, "") ?? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return `${base}/${R2_BUCKET}/${key}`;
};

const RETRIES = 1; // aws4fetch retries 5xx up to 10 times by default; a request must not hang that long

const credentials = () => ({
  accessKeyId: env().R2_ACCESS_KEY_ID,
  secretAccessKey: env().R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: env().R2_REGION,
});

async function presignPut(key: string, mime: string, bytes: number) {
  // allHeaders signs content-type and content-length too (aws4fetch skips them by default), so R2
  // refuses any PUT whose type or size differs from what the intent declared.
  const signed = await new AwsV4Signer({
    ...credentials(),
    method: "PUT",
    url: `${objectUrl(key)}?X-Amz-Expires=${PRESIGN_EXPIRES_S}`,
    headers: { "content-type": mime, "content-length": String(bytes) },
    signQuery: true,
    allHeaders: true,
  }).sign();
  return signed.url.toString();
}

async function head(key: string) {
  const res = await new AwsClient({ ...credentials(), retries: RETRIES }).fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key} failed: ${res.status}`);
  return {
    bytes: Number(res.headers.get("content-length")),
    mime: res.headers.get("content-type") ?? "",
    overridden: res.headers.has("content-disposition") || res.headers.has("content-encoding"),
  };
}

async function peek(key: string) {
  const res = await new AwsClient({ ...credentials(), retries: RETRIES }).fetch(objectUrl(key), {
    headers: { range: `bytes=0-${PEEK_BYTES - 1}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  if (res.status !== 206) {
    // A store that ignored Range would send the whole file (up to 100 MB): never read that.
    void res.body?.cancel();
    throw new Error(`R2 GET ${key} ignored the Range header`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function read(key: string, maxBytes: number) {
  const res = await new AwsClient({ ...credentials(), retries: RETRIES }).fetch(objectUrl(key));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  const tooBig = () => new Error(`R2 object ${key} is larger than ${maxBytes} bytes`);
  if (Number(res.headers.get("content-length")) > maxBytes) {
    void res.body?.cancel();
    throw tooBig();
  }
  // content-length can be missing (chunked), so also count while reading instead of trusting the header.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      void reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function deleteMany(keys: readonly string[]) {
  const client = new AwsClient({ ...credentials(), retries: RETRIES });
  // ponytail: one DELETE per key; a post has at most 20. Use DeleteObjects past a few hundred.
  const results = await Promise.all(keys.map((key) => client.fetch(objectUrl(key), { method: "DELETE" })));
  const failed = results.findIndex((r) => !r.ok && r.status !== 404);
  if (failed >= 0) throw new Error(`R2 DELETE ${keys[failed]} failed: ${results[failed]!.status}`);
}

// PLACEHOLDER (the bucket and media domain are set up outside this repo; see docs/R2-SETUP.md,
// "Purge on delete"). Until the CDN has a purge API wired in here, deleted media can stay in the
// edge cache for as long as the `Cache-Control` set on the media domain allows. Replace this body
// with the CDN's "purge by URL" call for `${NEXT_PUBLIC_MEDIA_BASE_URL}/${key}`.
async function purge(keys: readonly string[]) {
  void keys;
}

export const r2 = (): R2 => ({ presignPut, head, peek, read, deleteMany, purge });
