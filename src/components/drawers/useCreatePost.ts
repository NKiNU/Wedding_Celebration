"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CreatedPost, type UploadIntent } from "@/lib/api";
import { totalBytes, type FileRole } from "@/lib/domain/uploads";
import { putFile } from "@/lib/upload";

export type MediaItem = {
  role: FileRole;
  position: number;
  blob: Blob;
  mime: string;
  width?: number;
  height?: number;
  durationS?: number;
};

const UPLOAD_FAILED = "Upload didn’t finish. Check your connection and try again.";

export function useCreatePost() {
  const [status, setStatus] = useState<"idle" | "uploading" | "posting">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = (apply: () => void) => {
    if (mounted.current) apply();
  };
  const settle = (message: string | null) => {
    update(() => {
      setStatus("idle");
      setProgress(0);
      setError(message);
    });
    return message === null;
  };

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  const postWish = async (text: string) => {
    update(() => setError(null));
    const res = await api<CreatedPost>("/api/posts", "POST", { wishText: text });
    return settle(res.ok ? null : res.error.message);
  };

  const postMedia = async (items: MediaItem[], caption: string) => {
    update(() => {
      setError(null);
      setProgress(0);
      setStatus("uploading");
    });
    const files = items.map(({ role, position, mime, width, height, durationS, blob }) => ({
      role,
      position,
      mime,
      bytes: blob.size,
      width,
      height,
      durationS,
    }));
    const intent = await api<UploadIntent>("/api/uploads", "POST", { files });
    if (!intent.ok) return settle(intent.error.message);

    const { postId } = intent.data;
    const abandon = (message: string) => {
      void api(`/api/uploads/${postId}`, "DELETE"); // the server refuses once the post exists
      return settle(message);
    };

    const abort = new AbortController();
    const loaded = items.map(() => 0);
    const total = totalBytes(files);
    try {
      await Promise.all(
        intent.data.uploads.map((target) => {
          const i = items.findIndex((it) => it.role === target.role && it.position === target.position);
          if (i < 0) throw new Error("The server asked for a file we didn’t send");
          return putFile(
            target.url,
            items[i]!.blob,
            items[i]!.mime,
            (n) => {
              loaded[i] = n;
              update(() => setProgress(total === 0 ? 0 : totalBytes(loaded.map((bytes) => ({ bytes }))) / total));
            },
            abort.signal,
          );
        }),
      );
    } catch {
      abort.abort();
      return abandon(UPLOAD_FAILED);
    }

    update(() => setStatus("posting"));
    const trimmed = caption.trim();
    const created = await api<CreatedPost>("/api/posts", "POST", { postId, ...(trimmed ? { caption: trimmed } : {}) });
    return created.ok ? settle(null) : abandon(created.error.message);
  };

  return { status, progress, error, postWish, postMedia, reset };
}
