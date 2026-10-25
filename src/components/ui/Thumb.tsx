"use client";

import { useState } from "react";

/** Fills its (relative) parent with a lazy image; a file that fails to load leaves the soft tone. */
export function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden="true" className="absolute inset-0 block overflow-hidden bg-soft">
      {src && !failed && (
        // R2 serves ready-made thumbnails, so next/image's optimizer would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A load that failed before React attached onError never reports; check once on mount.
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) setFailed(true);
          }}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}
