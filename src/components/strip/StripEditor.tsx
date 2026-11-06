"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UploadProgress } from "@/components/drawers/UploadProgress";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CAPTION_MAX } from "@/lib/domain/limits";
import { STRIP_WINDOWS, TEMPLATE_H, TEMPLATE_W, type Pan, type Rect, type Size } from "@/lib/domain/strip";
import { flash } from "@/lib/flash";
import { DEFAULT_TEMPLATE_TEXT } from "@/lib/strip";
import { StripWindow, type LiftState, type Slot } from "./StripWindow";
import { usePostStrip } from "./usePostStrip";

type Props = {
  templateUrl: string;
  windows: readonly Rect[];
  /** Drawn by the app on the default template only; a custom template carries its own text. */
  text: { names: string; date: string | null } | null;
};

const HINT_MS = 2600;
const BIN_REACH = 60; // px from the bin's centre that count as "over the bin"
const UNREADABLE = "This photo can’t be read. Try another one.";

/** Display size of a photo, upright (EXIF orientation applied, as the canvas will draw it). */
async function sizeOf(file: File): Promise<Size> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return size;
  } catch {
    // iOS and some HEIC files reject createImageBitmap options; <img> decodes them.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cq = (templatePx: number) => `${(templatePx / TEMPLATE_W) * 100}cqw`;

export function StripEditor({ templateUrl, windows, text }: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState<(Slot | null)[]>(() => Array(STRIP_WINDOWS).fill(null));
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState<number | null>(null);
  const [lift, setLift] = useState<LiftState>("off");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { status, progress, preparing, busy, error, post } = usePostStrip();
  const bin = useRef<HTMLDivElement>(null);
  const names = useRef<HTMLParagraphElement>(null);
  const date = useRef<HTMLParagraphElement>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const count = slots.filter(Boolean).length;

  // Object URLs hold the picked files in memory: release them when the page goes. Next keeps a page
  // we leave mounted but hidden (<Activity>), so also start over: the next strip begins empty.
  const latest = useRef(slots);
  useEffect(() => {
    latest.current = slots;
  });
  useEffect(
    () => () => {
      clearTimeout(hintTimer.current);
      latest.current.forEach((s) => s && URL.revokeObjectURL(s.url));
      setSlots(Array(STRIP_WINDOWS).fill(null));
      setCaption("");
      setHint(null);
      setLift("off");
      setConfirming(false);
      setNotice(null);
    },
    [],
  );

  const setSlot = (i: number, slot: Slot | null) => setSlots((all) => all.map((s, j) => (j === i ? slot : s)));

  async function pick(i: number, file: File) {
    setNotice(null);
    let size: Size;
    try {
      size = await sizeOf(file);
    } catch {
      setNotice(UNREADABLE);
      return;
    }
    setSlot(i, { file, url: URL.createObjectURL(file), size, pan: { x: 0, y: 0 }, zoom: 1 });
    setHint(i);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }

  function remove(i: number) {
    const gone = slots[i];
    if (gone) URL.revokeObjectURL(gone.url);
    setSlot(i, null);
    setLift("off");
  }

  const adjust = (i: number, pan: Pan, zoom: number) => setSlots((all) => all.map((s, j) => (j === i && s ? { ...s, pan, zoom } : s)));

  const overBin = (x: number, y: number) => {
    const r = bin.current?.getBoundingClientRect();
    return !!r && Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < BIN_REACH;
  };

  const back = () => (count > 0 ? setConfirming(true) : router.push("/wall"));

  async function submit() {
    const photos = slots.filter((s): s is Slot => s !== null);
    if (photos.length !== STRIP_WINDOWS) return;
    setNotice(null);
    // The canvas needs the font families the page resolved (next/font renames them).
    const family = (el: HTMLElement | null) => (el ? getComputedStyle(el).fontFamily : "serif");
    const ok = await post({
      templateUrl,
      windows,
      photos,
      caption,
      text: text && { names: text.names, date: text.date, namesFont: family(names.current), dateFont: family(date.current) },
    });
    if (!ok) return;
    flash("Shared! Your photo strip is on the wall.");
    router.push("/wall");
  }

  const held = lift !== "off";
  const message = notice ?? error;

  return (
    <main aria-labelledby="strip-title" className="relative flex h-dvh flex-col overflow-hidden bg-viewer text-ink">
      <div className={`flex shrink-0 items-center gap-1 pt-[env(safe-area-inset-top)] pr-2 pl-1 motion-safe:transition-opacity ${held ? "opacity-25" : ""}`}>
        <button type="button" onClick={back} disabled={busy} aria-label="Back" className="flex size-11 items-center justify-center rounded-full disabled:opacity-35">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 id="strip-title" className="flex-1 text-base font-semibold">
          Photo strip
        </h1>
        <span role="status" className="pr-3 text-[13px] text-muted">
          {count} of {STRIP_WINDOWS} photos
        </span>
      </div>

      {/* The template, as large as fits: full width on a tall phone, centred and smaller on a short one. */}
      <div className="flex min-h-0 flex-1 justify-center [container-type:size]">
        <div className="relative aspect-[1080/1920] w-[min(100cqw,calc(100cqh*1080/1920))] self-start overflow-hidden select-none [container-type:inline-size]">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin template the canvas also reads */}
          <img src={templateUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full [-webkit-touch-callout:none]" />
          {text && (
            <div aria-hidden="true" className="pointer-events-none">
              <p
                ref={names}
                className="absolute inset-x-0 text-center font-script"
                style={{
                  top: `${(DEFAULT_TEMPLATE_TEXT.names.top / TEMPLATE_H) * 100}%`,
                  fontSize: cq(DEFAULT_TEMPLATE_TEXT.names.size),
                  lineHeight: DEFAULT_TEMPLATE_TEXT.names.lineHeight,
                  color: DEFAULT_TEMPLATE_TEXT.names.color,
                }}
              >
                {text.names}
              </p>
              {text.date && (
                <p
                  ref={date}
                  className="absolute inset-x-0 text-center font-sans"
                  style={{
                    top: `${(DEFAULT_TEMPLATE_TEXT.date.top / TEMPLATE_H) * 100}%`,
                    fontSize: cq(DEFAULT_TEMPLATE_TEXT.date.size),
                    lineHeight: DEFAULT_TEMPLATE_TEXT.date.lineHeight,
                    letterSpacing: cq(DEFAULT_TEMPLATE_TEXT.date.letterSpacing),
                    color: DEFAULT_TEMPLATE_TEXT.date.color,
                  }}
                >
                  {text.date}
                </p>
              )}
            </div>
          )}
          {windows.map((rect, i) => (
            <StripWindow
              key={i}
              index={i}
              rect={rect}
              slot={slots[i] ?? null}
              hint={hint === i}
              disabled={busy}
              onPick={(file) => void pick(i, file)}
              onAdjust={(pan, zoom) => adjust(i, pan, zoom)}
              onRemove={() => remove(i)}
              overBin={overBin}
              onLift={(state) => {
                setLift(state);
                if (state !== "off") setHint(null);
              }}
            />
          ))}
        </div>
      </div>

      <div className={`flex shrink-0 flex-col gap-2 px-4 pt-2.5 pb-[max(16px,env(safe-area-inset-bottom))] ${held ? "invisible" : ""}`}>
        {message && (
          <p role="alert" className="text-[13px] font-medium">
            {message}
          </p>
        )}
        {status !== "idle" ? (
          <UploadProgress status={status} progress={progress} />
        ) : (
          <div className="flex items-center gap-2.5">
            <label htmlFor="strip-caption" className="sr-only">
              Caption (optional)
            </label>
            <input
              id="strip-caption"
              type="text"
              value={caption}
              maxLength={CAPTION_MAX}
              disabled={busy}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption (optional)"
              enterKeyHint="done"
              className="h-[50px] min-w-0 flex-1 rounded-full bg-soft px-[18px] text-base text-ink placeholder:text-ink/60"
            />
            <button
              type="button"
              onClick={submit}
              disabled={count < STRIP_WINDOWS || busy}
              className="h-[50px] shrink-0 rounded-full bg-ink px-[22px] text-[15px] font-semibold text-paper transition-transform duration-100 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100"
            >
              {preparing ? "Preparing…" : "Post"}
            </button>
          </div>
        )}
      </div>

      {held && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[calc(18px+env(safe-area-inset-bottom))] flex flex-col items-center gap-1.5">
          <div
            ref={bin}
            className={`flex size-16 items-center justify-center rounded-full border-2 border-ink motion-safe:transition-transform motion-safe:duration-100 ${lift === "over" ? "scale-[1.18] bg-ink text-paper" : "bg-overlay text-ink"}`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />
            </svg>
          </div>
          <span className="text-xs font-medium">{lift === "over" ? "Release to remove" : "Drag here to remove"}</span>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Discard this strip?"
        body="The photos you placed will not be posted."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => router.push("/wall")}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}
