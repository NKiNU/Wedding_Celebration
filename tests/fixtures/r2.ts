import type { R2 } from "@/server/r2";

export type StoredObject = { bytes: number; mime: string; overridden?: boolean; start?: Uint8Array; body?: Uint8Array };

const SIGNATURE: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "video/mp4": [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], // "ftyp" at offset 4
  "video/quicktime": [0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70],
  "video/webm": [0x1a, 0x45, 0xdf, 0xa3],
};

/** In-memory stand-in for `r2()`: tests list the objects "uploaded" so far and read back what was deleted. */
export function fakeR2(objects: Record<string, StoredObject> = {}) {
  const store = new Map(Object.entries(objects));
  const deleted: string[] = [];
  const purged: string[] = [];
  const presigned: { key: string; mime: string; bytes: number }[] = [];
  const r2: R2 = {
    presignPut: async (key, mime, bytes) => {
      presigned.push({ key, mime, bytes });
      return `https://r2.test/${key}`;
    },
    head: async (key) => {
      const object = store.get(key);
      return object ? { overridden: false, ...object } : null;
    },
    peek: async (key) => {
      const object = store.get(key);
      if (!object) return null;
      return object.start ?? new Uint8Array([...(SIGNATURE[object.mime.split(";")[0]!.trim().toLowerCase()] ?? [0]), 0, 0, 0, 0, 0, 0, 0, 0]);
    },
    read: async (key, maxBytes) => {
      const object = store.get(key);
      if (!object?.body) return null;
      if (object.body.length > maxBytes) throw new Error("too large");
      return object.body;
    },
    purge: async (keys) => {
      purged.push(...keys);
    },
    deleteMany: async (keys) => {
      for (const key of keys) {
        deleted.push(key);
        store.delete(key);
      }
    },
  };
  return { r2, store, deleted, purged, presigned };
}
