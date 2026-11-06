"use client";

import { useState } from "react";
import { useCreatePost, type MediaItem } from "@/components/drawers/useCreatePost";
import { STRIP_OUT_H, STRIP_OUT_W, type Pan, type Rect } from "@/lib/domain/strip";
import { MediaError, preparePhoto } from "@/lib/media";
import { composeStrip, type StripText } from "@/lib/strip";

export type StripInput = {
  templateUrl: string;
  windows: readonly Rect[];
  photos: readonly { file: File; pan: Pan; zoom: number }[];
  text: StripText | null;
  caption: string;
};

const JPEG = "image/jpeg";

/**
 * Position 0 is the finished strip; positions 1–3 the photos as picked (resized, uncropped).
 * Photos are resized one at a time: phones run out of canvas memory otherwise.
 */
async function prepareStrip({ templateUrl, windows, photos, text }: StripInput): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  for (const [i, photo] of photos.entries()) {
    try {
      const { main, thumb, width, height } = await preparePhoto(photo.file);
      items.push({ role: "main", position: i + 1, blob: main, mime: JPEG, width, height }, { role: "thumb", position: i + 1, blob: thumb, mime: JPEG });
    } catch (e) {
      const reason = e instanceof MediaError ? e.message : "This photo can’t be read. Try another one.";
      throw new MediaError(`Photo ${i + 1}: ${reason}`);
    }
  }
  // The resized photos are enough for the strip and far lighter to decode than the originals.
  const sources = await Promise.all(items.filter((it) => it.role === "main").map((it) => createImageBitmap(it.blob)));
  try {
    const { image, thumb } = await composeStrip({
      templateUrl,
      windows,
      photos: sources.map((source, i) => ({ source, pan: photos[i]!.pan, zoom: photos[i]!.zoom })),
      text,
    });
    return [
      { role: "main", position: 0, blob: image, mime: JPEG, width: STRIP_OUT_W, height: STRIP_OUT_H },
      { role: "thumb", position: 0, blob: thumb, mime: JPEG },
      ...items,
    ];
  } finally {
    sources.forEach((s) => s.close());
  }
}

/** Prepare, compose and upload a strip through the same intent → PUT → post flow as the Photos drawer. */
export function usePostStrip() {
  const { status, progress, error, postMedia } = useCreatePost();
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const post = async (input: StripInput) => {
    setProblem(null);
    setPreparing(true);
    let items: MediaItem[];
    try {
      items = await prepareStrip(input);
    } catch (e) {
      setProblem(e instanceof MediaError ? e.message : "The photo strip couldn’t be made. Please try again.");
      return false;
    } finally {
      setPreparing(false);
    }
    return postMedia(items, input.caption, "strip");
  };

  return { status, progress, preparing, busy: preparing || status !== "idle", error: problem ?? error, post };
}
