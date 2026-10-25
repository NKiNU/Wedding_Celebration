"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MB, VIDEO_MIMES } from "@/lib/domain/limits";
import { MediaError, prepareVideo, type PreparedVideo } from "@/lib/media";
import { BottomSheet } from "./BottomSheet";
import { CaptionField } from "./CaptionField";
import { UploadProgress } from "./UploadProgress";
import { useCreatePost, type MediaItem } from "./useCreatePost";

type Chosen = PreparedVideo & { previewUrl: string | null };

type Props = { open: boolean; onClose: () => void; onPosted: (type: "video") => void };

const sizeLabel = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

export function VideoDrawer({ open, onClose, onPosted }: Props) {
  const [video, setVideo] = useState<Chosen | null>(null);
  const [caption, setCaption] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { status, progress, error, postMedia, reset } = useCreatePost();
  const busy = checking || status !== "idle";

  // The poster preview is an object URL: release it when the video goes and on unmount.
  const latest = useRef(video);
  useEffect(() => {
    latest.current = video;
  });
  useEffect(() => () => release(latest.current), []);

  const clear = () => {
    release(video);
    setVideo(null);
    setCaption("");
    setProblem(null);
    reset();
  };
  const close = () => {
    clear();
    onClose();
  };

  async function pick(file: File | undefined) {
    if (!file) return;
    release(video);
    setVideo(null);
    setProblem(null);
    if (!(VIDEO_MIMES as readonly string[]).includes(file.type)) {
      setProblem("That video type isn’t supported. Please choose an MP4 or MOV video.");
      return;
    }
    setChecking(true);
    try {
      const prepared = await prepareVideo(file);
      setVideo({ ...prepared, previewUrl: prepared.poster ? URL.createObjectURL(prepared.poster) : null });
    } catch (e) {
      setProblem(e instanceof MediaError ? e.message : "This video can’t be read. Try another one.");
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!video) return;
    const items: MediaItem[] = [
      { role: "main", position: 0, blob: video.file, mime: video.file.type, width: video.width, height: video.height, durationS: video.durationS },
    ];
    if (video.poster) items.push({ role: "poster", position: 0, blob: video.poster, mime: "image/jpeg" });
    if (await postMedia(items, caption)) {
      clear();
      onPosted("video");
    }
  }

  return (
    <BottomSheet open={open} title="Share a video" onClose={close} busy={busy}>
      <p className="text-[13px] text-muted">One video per post, up to about 60 seconds (100 MB).</p>
      {!video && (
        <label
          className={`relative flex min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-line bg-card px-4 py-[18px] text-center has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${busy ? "opacity-35" : ""}`}
        >
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="13" height="12" rx="2.5" />
            <path d="M16 10.5l5-3v9l-5-3" />
          </svg>
          <span className="text-sm font-semibold">{checking ? "Checking your video…" : "Choose a video"}</span>
          <span className="text-xs text-muted">MP4 or MOV, from gallery or camera</span>
          <input
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = ""; // so the same video can be picked again after an error
            }}
            className="sr-only"
          />
        </label>
      )}
      {problem && (
        <p role="alert" className="text-[13px] font-medium">
          {problem}
        </p>
      )}
      {video && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
          <span className="relative block size-16 flex-none overflow-hidden rounded-[10px] bg-soft">
            {video.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise
              <img src={video.previewUrl} alt="" className="size-full object-cover" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{video.file.name}</span>
            <span className="text-xs text-muted">{sizeLabel(video.file.size)}</span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              release(video);
              setVideo(null);
            }}
            aria-label="Remove video"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      <CaptionField value={caption} onChange={setCaption} placeholder="e.g. First dance" disabled={busy} />
      {error && (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      )}
      {status !== "idle" ? (
        <UploadProgress status={status} progress={progress} />
      ) : (
        <Button type="button" onClick={submit} disabled={!video || busy}>
          Post video
        </Button>
      )}
    </BottomSheet>
  );
}

function release(video: Chosen | null) {
  if (video?.previewUrl) URL.revokeObjectURL(video.previewUrl);
}
