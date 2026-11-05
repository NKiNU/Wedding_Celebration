"use client";

import { useState } from "react";

/**
 * Fills its (relative) parent with a lazy image. Until the file arrives the tile shimmers
 * (.media-loading), then the image fades in; a file that fails to load leaves the plain soft tone.
 */
export function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loading = !!src && !failed && !loaded;
  return (
    <span aria-hidden="true" className={`absolute inset-0 block overflow-hidden bg-soft ${loading ? "media-loading" : ""}`}>
      {src && !failed && (
        // R2 serves ready-made thumbnails, so next/image's optimizer would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A load (or failure) that finished before React attached its handlers never reports; check on mount.
          ref={(img) => {
            if (!img?.complete) return;
            if (img.naturalWidth === 0) setFailed(true);
            else setLoaded(true);
          }}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`size-full object-cover transition-opacity duration-240 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
