import type { R2 } from "@/server/r2";

export type StoredObject = { bytes: number; mime: string };

/** In-memory stand-in for `r2()`: tests list the objects "uploaded" so far and read back what was deleted. */
export function fakeR2(objects: Record<string, StoredObject> = {}) {
  const store = new Map(Object.entries(objects));
  const deleted: string[] = [];
  const presigned: { key: string; mime: string; bytes: number }[] = [];
  const r2: R2 = {
    presignPut: async (key, mime, bytes) => {
      presigned.push({ key, mime, bytes });
      return `https://r2.test/${key}`;
    },
    head: async (key) => store.get(key) ?? null,
    deleteMany: async (keys) => {
      for (const key of keys) {
        deleted.push(key);
        store.delete(key);
      }
    },
  };
  return { r2, store, deleted, presigned };
}
