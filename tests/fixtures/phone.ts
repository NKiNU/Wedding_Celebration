// The helpers of the integration tests that run against the real stack: a phone that keeps its
// cookies, and the upload steps. See uploads.test.ts for how to run them.
import { expect } from "vitest";

export const BASE = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3000";
export const JSON_HEADERS = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

export type Api<T = Record<string, unknown>> = { status: number; body: { ok: boolean; data?: T; error?: { code: string } } };

/** A phone: it keeps the cookies the server sets. */
export async function join(): Promise<{ call: <T = Record<string, unknown>>(method: string, path: string, body?: unknown) => Promise<Api<T>> }> {
  let cookie = "";
  const call = async <T,>(method: string, path: string, body?: unknown): Promise<Api<T>> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...JSON_HEADERS, ...(cookie && { cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
    if (set.length > 0) cookie = [...new Map([...cookie.split("; "), ...set].filter(Boolean).map((c) => [c.split("=")[0], c])).values()].join("; ");
    return { status: res.status, body: await res.json() };
  };
  const name = `Int ${Math.random().toString(36).slice(2, 8)}`;
  expect((await call("POST", "/api/guests", { name })).status).toBe(201);
  return { call };
}

export const photoFiles = (bytes = 3000) => [
  { role: "main", position: 0, mime: "image/jpeg", bytes, width: 2048, height: 1536 },
  { role: "thumb", position: 0, mime: "image/jpeg", bytes: 1000 },
];
export type Intent = { postId: string; uploads: { role: string; url: string }[] };

const JPEG_START = [0xff, 0xd8, 0xff, 0xe0];

/** `bytes` bytes that start like a JPEG (the server checks the first bytes), or like nothing. */
export const body = (bytes: number, jpeg = true) => {
  const data = new Uint8Array(bytes).fill(7);
  if (jpeg) data.set(JPEG_START);
  return data;
};

export const put = (url: string, bytes: number, type = "image/jpeg", jpeg = true) =>
  fetch(url, { method: "PUT", headers: { "content-type": type }, body: body(bytes, jpeg) });

/** Issues an intent and uploads exactly what it declared. */
export async function uploadedIntent(phone: Awaited<ReturnType<typeof join>>, files = photoFiles()) {
  const intent = await phone.call<Intent>("POST", "/api/uploads", { files });
  expect(intent.status).toBe(201);
  for (const target of intent.body.data!.uploads) {
    const file = files.find((f) => f.role === target.role)!;
    expect((await put(target.url, file.bytes)).status).toBe(200);
  }
  return intent.body.data!;
}

