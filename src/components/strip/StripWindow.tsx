"use client";

import { useEffect, useRef, useState } from "react";
import { clampPan, clampZoom, coverScale, TEMPLATE_H, TEMPLATE_W, type Pan, type Rect, type Size } from "@/lib/domain/strip";

/** A photo chosen for a window: kept as the File until Post, shown from an object URL. */
export type Slot = { file: File; url: string; size: Size; pan: Pan; zoom: number };

export type LiftState = "off" | "held" | "over";

export const HOLD_MS = 450;
const MOVE_SLOP = 6; // px a finger may wander before a hold becomes a drag

type Point = { x: number; y: number };
type Props = {
  index: number;
  rect: Rect;
  slot: Slot | null;
  hint: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onAdjust: (pan: Pan, zoom: number) => void;
  onRemove: () => void;
  /** Whether a finger at these screen coordinates is over the bin. */
  overBin: (x: number, y: number) => boolean;
  onLift: (state: LiftState) => void;
};

const pct = (v: number) => `${v * 100}%`;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) || 1;

/** One photo window on the template: empty = a file picker; filled = drag to move, pinch to zoom, hold to lift. */
export function StripWindow({ index, rect, slot, hint, disabled, onPick, onAdjust, onRemove, overBin, onLift }: Props) {
  const n = index + 1;
  const pts = useRef(new Map<number, Point>());
  const start = useRef<{ pan: Pan; zoom: number; pts: Map<number, Point>; k: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  type Lift = { dx: number; dy: number; over: boolean } | null;
  const lifted = useRef<Lift>(null); // read by the pointer handlers between renders
  const [lift, setLift] = useState<Lift>(null);
  useEffect(() => () => clearTimeout(hold.current), []);

  const box = { left: pct(rect.x / TEMPLATE_W), top: pct(rect.y / TEMPLATE_H), width: pct(rect.w / TEMPLATE_W), height: pct(rect.h / TEMPLATE_H) };

  if (!slot) {
    return (
      <label
        style={box}
        className={`absolute flex cursor-pointer flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-paper/60 bg-sheet text-paper has-focus-visible:outline-2 has-focus-visible:-outline-offset-4 has-focus-visible:outline-paper ${disabled ? "opacity-60" : ""}`}
      >
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="text-xs font-semibold">Add photo {n}</span>
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same photo can be picked again after removing it
            if (file) onPick(file);
          }}
        />
      </label>
    );
  }

  const setLifted = (next: typeof lifted.current) => {
    lifted.current = next;
    setLift(next);
    onLift(next ? (next.over ? "over" : "held") : "off");
  };
  const begin = (el: HTMLElement) => {
    const width = el.getBoundingClientRect().width;
    start.current = { pan: slot.pan, zoom: slot.zoom, pts: new Map(pts.current), k: width ? rect.w / width : 1 };
  };
  const adjust = (pan: Pan, zoom: number) => {
    const z = clampZoom(zoom);
    onAdjust(clampPan(pan, z, slot.size, rect), z);
  };
  const reset = () => {
    clearTimeout(hold.current);
    pts.current.clear();
    start.current = null;
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin(e.currentTarget);
    clearTimeout(hold.current); // a second finger means pinch, not hold
    if (pts.current.size === 1) hold.current = setTimeout(() => setLifted({ dx: 0, dy: 0, over: false }), HOLD_MS);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || !pts.current.has(e.pointerId)) return;
    const at = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, at);
    const from = s.pts.get(e.pointerId);
    if (lifted.current) {
      if (from) setLifted({ dx: at.x - from.x, dy: at.y - from.y, over: overBin(at.x, at.y) });
      return;
    }
    const [a, b] = [...pts.current.entries()];
    const a0 = a && s.pts.get(a[0]);
    const b0 = b && s.pts.get(b[0]);
    if (a0 && dist(a[1], a0) > MOVE_SLOP) clearTimeout(hold.current);
    if (b && a0 && b0) adjust(s.pan, (s.zoom * dist(a[1], b[1])) / dist(a0, b0));
    else if (a && a0) adjust({ x: s.pan.x + (a[1].x - a0.x) * s.k, y: s.pan.y + (a[1].y - a0.y) * s.k }, s.zoom);
  };

  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    clearTimeout(hold.current);
    pts.current.delete(e.pointerId);
    const l = lifted.current;
    if (l) {
      reset();
      setLifted(null);
      if (l.over) onRemove();
      return;
    }
    if (pts.current.size) begin(e.currentTarget);
    else start.current = null;
  };

  const cancel = () => {
    reset();
    if (lifted.current) setLifted(null);
  };

  const s = coverScale(slot.size, rect) * slot.zoom;
  const w = (slot.size.w * s) / rect.w;
  const h = (slot.size.h * s) / rect.h;

  return (
    <div
      style={{ ...box, transform: lift ? `translate(${lift.dx}px, ${lift.dy}px) scale(${lift.over ? 0.42 : 0.88})` : undefined }}
      className={`absolute motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out ${lift ? `z-30 shadow-(--fab-shadow) ${lift.over ? "opacity-75" : ""}` : ""}`}
    >
      <div
        tabIndex={0}
        role="img"
        aria-label={`Photo ${n}. Drag to move, pinch to zoom. Hold and drag to the bin, or press Delete, to remove it.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => !disabled && adjust(slot.pan, slot.zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        onKeyDown={(e) => {
          if (disabled || (e.key !== "Delete" && e.key !== "Backspace")) return;
          e.preventDefault();
          onRemove();
        }}
        className={`absolute inset-0 touch-none overflow-hidden bg-soft [-webkit-touch-callout:none] focus-visible:outline-offset-2 ${lift ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise */}
        <img
          src={slot.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{
            width: pct(w),
            height: pct(h),
            left: pct(0.5 + slot.pan.x / rect.w - w / 2),
            top: pct(0.5 + slot.pan.y / rect.h - h / 2),
          }}
        />
      </div>
      {hint && !lift && (
        <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-xl bg-overlay px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-overlay-ink">
          Pinch to zoom · hold to remove
        </span>
      )}
      <button type="button" disabled={disabled} onClick={onRemove} className="sr-only">
        Remove photo {n}
      </button>
    </div>
  );
}
