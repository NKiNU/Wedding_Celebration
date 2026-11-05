"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminEvent } from "@/lib/api";
import {
  DEFAULT_WINDOWS,
  formatEventDate,
  TEMPLATE_H,
  TEMPLATE_W,
  WINDOW_MIN_H,
  WINDOW_MIN_W,
  windowsProblem,
  type Rect,
} from "@/lib/domain/strip";
import { Field, Section } from "./Field";
import type { EventPatch } from "./useAdminEvent";
import { useStripTemplate } from "./useStripTemplate";

type Props = {
  event: AdminEvent;
  saving: boolean;
  save: (patch: EventPatch) => Promise<string | null>;
  onChanged: (event: AdminEvent) => void;
};

type Drag = { i: number; mode: "move" | "size"; px: number; py: number; from: Rect };

const PREVIEW_W = 260;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const FIELDS = [
  ["x", "X"],
  ["y", "Y"],
  ["w", "Width"],
  ["h", "Height"],
] as const;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Whole pixels, at least the minimum size, inside the template. */
function clampWin(r: Rect): Rect {
  const w = Math.max(WINDOW_MIN_W, Math.min(TEMPLATE_W, Math.round(r.w)));
  const h = Math.max(WINDOW_MIN_H, Math.min(TEMPLATE_H, Math.round(r.h)));
  return {
    x: Math.max(0, Math.min(TEMPLATE_W - w, Math.round(r.x))),
    y: Math.max(0, Math.min(TEMPLATE_H - h, Math.round(r.y))),
    w,
    h,
  };
}

/** The photo strip template, its three photo windows, and the wedding date the default template shows. */
export function StripTemplateSection({ event, saving, save, onChanged }: Props) {
  const [wins, setWins] = useState<Rect[]>(event.stripWindows);
  const [sel, setSel] = useState(0);
  const [same, setSame] = useState(true);
  const [date, setDate] = useState(event.eventDate ?? "");
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const { upload, remove, progress, error: uploadError } = useStripTemplate(onChanged);

  const problem = windowsProblem(wins);
  const layoutChanged = JSON.stringify(wins) !== JSON.stringify(event.stripWindows);
  const shownDate = formatEventDate(date);
  const cur = wins[sel]!;

  function update(i: number, changes: Partial<Rect>) {
    setWins((prev) => {
      const next = prev.slice();
      next[i] = clampWin({ ...prev[i]!, ...changes });
      if (same && ("w" in changes || "h" in changes)) {
        for (let j = 0; j < next.length; j++) {
          if (j !== i) next[j] = clampWin({ ...prev[j]!, w: next[i]!.w, h: next[i]!.h });
        }
      }
      return next;
    });
  }

  const grab = (i: number, mode: Drag["mode"]) => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId); // keep the drag when the finger leaves the window
    drag.current = { i, mode, px: e.clientX, py: e.clientY, from: wins[i]! };
    setSel(i);
  };

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const f = TEMPLATE_W / (stage.current?.getBoundingClientRect().width || PREVIEW_W);
    const dx = (e.clientX - d.px) * f;
    const dy = (e.clientY - d.py) * f;
    if (d.mode === "move") update(d.i, { x: d.from.x + dx, y: d.from.y + dy });
    else update(d.i, { w: d.from.w + dx, h: d.from.h + dy });
  }

  const nudge = (i: number) => (e: React.KeyboardEvent) => {
    const arrow = ARROWS[e.key];
    if (!arrow) return;
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    setSel(i);
    update(i, { x: wins[i]!.x + arrow[0] * step, y: wins[i]!.y + arrow[1] * step });
  };

  return (
    <Section title="Photo strip template">
      <p className="text-[13px] text-muted">
        Upload the full-screen design (background and strip together). Then place the three photo windows on it. Guests’ photos
        fill the windows; the saved image is story size.
      </p>

      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ eventDate: date || null }).then(setDateError);
        }}
      >
        <Field
          label="Wedding date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint={shownDate ? `Shown on the default template as “${shownDate}”.` : "Shown on the default template."}
        />
        {dateError && (
          <p role="alert" className="text-[13px] font-medium">
            {dateError}
          </p>
        )}
        <Button type="submit" disabled={saving || date === (event.eventDate ?? "")}>
          {saving ? "Saving…" : "Save date"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-11 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-soft px-5 text-sm font-semibold select-none active:opacity-80 has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
          {progress !== null
            ? `Uploading ${Math.round(progress * 100)}%`
            : event.hasStripTemplate
              ? "Replace template"
              : "Upload template"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={progress !== null}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // choosing the same file again must still fire
              if (file) void upload(file);
            }}
          />
        </label>
        {event.hasStripTemplate && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-11 touch-manipulation rounded-full bg-soft px-5 text-sm font-semibold select-none active:opacity-80"
          >
            Use default template
          </button>
        )}
      </div>
      <p className="text-xs text-muted">PNG or JPG, 1080 × 1920 px (Instagram story size), up to 3 MB.</p>
      {uploadError && (
        <p role="alert" className="text-[13px] font-medium">
          {uploadError}
        </p>
      )}

      <details className="text-[13px]">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium select-none">Template guide (for the designer)</summary>
        <ul className="flex list-disc flex-col gap-1.5 pb-1 pl-5 text-muted">
          <li>One full-screen image, 1080 × 1920 px (9 : 16): the background and the strip together. PNG or JPG, up to 3 MB.</li>
          <li>
            Draw empty boxes where the 3 photos go. Photos sit on top of the design, so nothing drawn inside a window shows.
            Default: 500 × 375 px each, x 290, y 250 / 665 / 1080.
          </li>
          <li>Instagram covers the top 250 px and the bottom 340 px: keep the photos and the couple’s names between them.</li>
          <li>Guests save exactly this image with their 3 photos in the windows.</li>
        </ul>
      </details>

      <div className="flex flex-col items-center gap-2">
        <div
          ref={stage}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          className="relative aspect-[9/16] w-[260px] touch-none rounded-media bg-soft select-none [-webkit-touch-callout:none]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.stripTemplateUrl}
            alt={event.hasStripTemplate ? "Your strip template" : "Default strip template"}
            draggable={false}
            className="absolute inset-0 size-full rounded-media object-cover"
          />
          {wins.map((r, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-pressed={i === sel}
              aria-label={`Window ${i + 1}, x ${r.x}, y ${r.y}, ${r.w} by ${r.h}. Arrow keys move it.`}
              onPointerDown={grab(i, "move")}
              onFocus={() => setSel(i)}
              onKeyDown={nudge(i)}
              className={`absolute flex cursor-move items-center justify-center border-ink bg-soft/85 text-sm font-semibold text-ink ${
                i === sel ? "z-10 border-2 border-solid" : "border-[1.5px] border-dashed"
              }`}
              style={{ left: pct(r.x, TEMPLATE_W), top: pct(r.y, TEMPLATE_H), width: pct(r.w, TEMPLATE_W), height: pct(r.h, TEMPLATE_H) }}
            >
              {i + 1}
              {i === sel && (
                <span
                  aria-hidden="true"
                  data-testid="resize-handle"
                  onPointerDown={grab(i, "size")}
                  className="absolute -right-[22px] -bottom-[22px] flex size-11 cursor-nwse-resize items-center justify-center"
                >
                  <span className="size-3.5 rounded-full border-2 border-card bg-ink" />
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="text-[11px] text-muted">Drag a window to move it · drag its corner to resize · arrow keys move it</span>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[13px] font-semibold">Window {sel + 1} (in template pixels)</legend>
        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map(([k, label]) => (
            <Field
              // Remounts when the value changes elsewhere (drag, keys); typing commits on blur or Enter.
              key={`${sel}-${k}-${cur[k]}`}
              label={label}
              type="number"
              inputMode="numeric"
              defaultValue={cur[k]}
              onBlur={(e) => {
                const v = e.currentTarget.valueAsNumber;
                if (Number.isNaN(v)) e.currentTarget.value = String(cur[k]);
                else if (v !== cur[k]) update(sel, { [k]: v });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
          ))}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} className="size-[22px] accent-ink" />
          Same size for all three windows
        </label>
      </fieldset>

      {(problem ?? layoutError) && (
        <p role="alert" className="text-[13px] font-medium">
          {problem ?? layoutError}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={saving || !layoutChanged || problem !== null}
          onClick={() => void save({ stripWindows: wins }).then(setLayoutError)}
        >
          {saving ? "Saving…" : "Save layout"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setWins(DEFAULT_WINDOWS.map((r) => ({ ...r })));
            setSel(0);
            setLayoutError(null);
          }}
          className="h-[54px] touch-manipulation rounded-full bg-soft px-5 text-sm font-semibold select-none active:opacity-80"
        >
          Reset
        </button>
      </div>
      <p className="text-xs text-muted">A new template or layout applies to new strips. Strips already posted keep theirs.</p>

      <ConfirmDialog
        open={confirming}
        title="Use the default template?"
        body="New strips will use the built-in design again, and your uploaded template is removed. Strips already posted keep theirs."
        confirmLabel="Use default"
        cancelLabel="Keep mine"
        onConfirm={() => {
          setConfirming(false);
          void remove();
        }}
        onCancel={() => setConfirming(false)}
      />
    </Section>
  );
}
