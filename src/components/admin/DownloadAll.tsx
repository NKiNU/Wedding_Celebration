"use client";

import { Button } from "@/components/ui/Button";
import { Section } from "./Field";
import { useDownloadAll } from "./useDownloadAll";

/** One zip of every photo and video, a folder per guest. Best on a laptop. */
export function DownloadAll() {
  const { download, progress, error, notice } = useDownloadAll();
  return (
    <Section title="Download everything">
      <p className="text-sm text-muted">
        Saves every photo and video as one zip, with a folder for each guest. Hidden posts are included. Use a laptop on good wifi.
      </p>
      {error && (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] font-medium">
          {notice}
        </p>
      )}
      <Button type="button" onClick={() => void download()} disabled={progress !== null}>
        {progress === null
          ? "Download zip"
          : progress.total === 0
            ? "Preparing…"
            : `Zipping ${progress.done} of ${progress.total}…`}
      </Button>
    </Section>
  );
}
