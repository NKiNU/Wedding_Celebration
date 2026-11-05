"use client";

import { useState } from "react";
import { api, type AdminEvent, type ImageUpload } from "@/lib/api";
import { stripTemplateProblem } from "@/lib/domain/uploads";
import { putFile } from "@/lib/upload";

const ROUTE = "/api/admin/strip-template";

/** Presign, PUT straight to storage, then ask the server to check the size and use it; `remove` goes back to the default. */
export function useStripTemplate(onDone: (event: AdminEvent) => void) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    const problem = stripTemplateProblem(file.type, file.size);
    if (problem) return setError(problem);
    setError(null);
    setProgress(0);
    try {
      const presigned = await api<ImageUpload>(ROUTE, "POST", { mime: file.type, bytes: file.size });
      if (!presigned.ok) throw new Error(presigned.error.message);
      await putFile(presigned.data.url, file, file.type, (loaded) => setProgress(loaded / file.size));
      const confirmed = await api<AdminEvent>(ROUTE, "PUT", { key: presigned.data.key });
      if (!confirmed.ok) throw new Error(confirmed.error.message);
      onDone(confirmed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Please try again.");
    } finally {
      setProgress(null);
    }
  }

  async function remove(): Promise<void> {
    setError(null);
    const result = await api<AdminEvent>(ROUTE, "DELETE");
    if (!result.ok) return setError(result.error.message);
    onDone(result.data);
  }

  return { upload, remove, progress, error };
}
