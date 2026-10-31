"use client";

import { downloadZip } from "client-zip";
import { useState } from "react";
import { api, type ManifestEntry } from "@/lib/api";

/**
 * Builds one zip in the browser from the media URLs (a server job would be cut off after seconds)
 * and saves it. Files are fetched one at a time, but the finished zip is held in memory.
 * ponytail: fine on a laptop for a few GB; for a very large event copy the bucket instead.
 */
export function useDownloadAll() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function download() {
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: 0 });
    try {
      const manifest = await api<ManifestEntry[]>("/api/admin/media", "GET");
      if (!manifest.ok) throw new Error(manifest.error.message);
      const entries = manifest.data;
      if (entries.length === 0) throw new Error("There are no photos or videos yet.");

      let done = 0;
      let missing = 0;
      async function* files() {
        for (const entry of entries) {
          // A browser refusal (no CORS GET on the media domain) is a bare TypeError: say what to check.
          const res = await fetch(entry.url).catch(() => {
            throw new Error("Couldn’t reach the media files. Check that the media domain allows downloads from this site (CORS).");
          });
          // A file that is gone (a post whose upload was lost) must not cost the admin the whole zip.
          if (res.status === 404) missing++;
          else if (!res.ok) throw new Error(`Couldn’t fetch ${entry.name} (${res.status}).`);
          else yield { name: entry.name, input: res };
          setProgress({ done: ++done, total: entries.length });
        }
      }
      setProgress({ done: 0, total: entries.length });
      const blob = await downloadZip(files()).blob();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "wedding-memories.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      if (missing > 0) setNotice(`Saved. ${missing} of ${entries.length} files were missing in storage and are not in the zip.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download failed. Please try again.");
    } finally {
      setProgress(null);
    }
  }

  return { download, progress, error, notice };
}
