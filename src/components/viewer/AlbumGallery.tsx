"use client";

import { useEffect, useRef, useState } from "react";
import { Thumb } from "@/components/ui/Thumb";
import type { WallMedia } from "@/lib/domain/posts";

const ARROW =
  "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-overlay-soft text-overlay-ink aria-disabled:opacity-30";

function Slide({ media, label, eager }: { media: WallMedia; label: string; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    // The slide shimmers (.media-loading) until its photo has downloaded, then the photo fades in.
    <li className={`flex size-full flex-none snap-center snap-always items-center justify-center ${failed || loaded ? "" : "media-loading"}`}>
      {failed ? (
        <p className="px-6 text-center text-sm text-overlay-ink/70">This photo can’t be loaded right now.</p>
      ) : (
        // The 2048 px original from the media domain: next/image's optimizer would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={label}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          ref={(img) => {
            if (!img?.complete) return;
            if (img.naturalWidth === 0) setFailed(true);
            else setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`size-full object-contain transition-opacity duration-240 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </li>
  );
}

/**
 * One photo, or an album: a native scroll-snap track (the browser's own swipe physics), prev/next
 * buttons, a "2 / 5" counter and a thumbnail strip. A single photo shows none of the chrome.
 */
/**
 * `label` names a single image (default "Photo"). `fill` gives the image all the room there is
 * instead of the 4:5 photo frame: for the 9:16 photo strip, which the frame would leave in dark bands.
 */
export function AlbumGallery({ media, label = "Photo", fill = false }: { media: WallMedia[]; label?: string; fill?: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const count = media.length;

  const go = (to: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(count - 1, to)) * el.clientWidth }); // `scroll-smooth` animates it
  };
  const onScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const { scrollLeft, clientWidth } = e.currentTarget;
    if (clientWidth > 0) setIndex(Math.round(scrollLeft / clientWidth));
  };

  // Keep the current thumbnail in view when the guest swipes through a long album.
  useEffect(() => {
    strip.current?.children[index]?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [index]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className={`relative ${fill ? "size-full" : "aspect-4/5 max-h-full w-full"}`}>
          <ul
            ref={track}
            tabIndex={count > 1 ? 0 : undefined}
            aria-label="Photos"
            onScroll={onScroll}
            className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto"
          >
            {media.map((m, i) => (
              <Slide key={m.url} media={m} eager={i === 0} label={count > 1 ? `Photo ${i + 1} of ${count}` : label} />
            ))}
          </ul>
          {count > 1 && (
            <>
              <span className="pointer-events-none absolute top-3 right-3 rounded-xl bg-overlay-soft px-2.5 py-1 text-xs font-semibold text-overlay-ink">
                {index + 1} / {count}
              </span>
              <button type="button" onClick={() => go(index - 1)} aria-disabled={index === 0} aria-label="Previous photo" className={`${ARROW} left-2.5`}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button type="button" onClick={() => go(index + 1)} aria-disabled={index === count - 1} aria-label="Next photo" className={`${ARROW} right-2.5`}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {count > 1 && (
        <ul ref={strip} aria-label="Thumbnails" className="flex gap-2.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
          {media.map((m, i) => (
            <li key={m.url} className="flex-none">
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Show photo ${i + 1} of ${count}`}
                aria-current={i === index}
                className={`relative block size-14 overflow-hidden rounded-lg ${i === index ? "outline-2 outline-offset-2 outline-overlay-ink" : "opacity-55"}`}
              >
                <Thumb src={m.thumbUrl ?? m.url} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
