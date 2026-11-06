/**
 * Photo strip rules (pure): the story-size template, its three photo windows, and the
 * cover-fit maths that keeps a photo filling its window while the guest pans and zooms.
 * Window and pan values are in template pixels (1080 x 1920), whatever size the screen shows.
 */

export const TEMPLATE_W = 1080;
export const TEMPLATE_H = 1920;
/** The finished strip is drawn at 2x the template (2160 x 3840) so the photos in their small windows stay sharp. */
export const STRIP_OUTPUT_SCALE = 2;
export const STRIP_OUT_W = TEMPLATE_W * STRIP_OUTPUT_SCALE;
export const STRIP_OUT_H = TEMPLATE_H * STRIP_OUTPUT_SCALE;
export const STRIP_WINDOWS = 3;
export const WINDOW_MIN_W = 160;
export const WINDOW_MIN_H = 120;
export const MAX_ZOOM = 4;

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Pan = { x: number; y: number };

/** The design's spots (canvas "Wedding Memories, Burgundy", row "Photo strip"). */
export const DEFAULT_WINDOWS: readonly Rect[] = [
  { x: 290, y: 250, w: 500, h: 375 },
  { x: 290, y: 665, w: 500, h: 375 },
  { x: 290, y: 1080, w: 500, h: 375 },
];

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Why these windows cannot be saved, or null. */
export function windowsProblem(rects: readonly Rect[]): string | null {
  if (rects.length !== STRIP_WINDOWS) return `A strip has exactly ${STRIP_WINDOWS} windows.`;
  for (const [i, r] of rects.entries()) {
    const n = i + 1;
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger)) return `Window ${n} needs whole pixel values.`;
    if (r.w < WINDOW_MIN_W || r.h < WINDOW_MIN_H) return `Window ${n} must be at least ${WINDOW_MIN_W} × ${WINDOW_MIN_H} px.`;
    if (r.x < 0 || r.y < 0 || r.x + r.w > TEMPLATE_W || r.y + r.h > TEMPLATE_H) {
      return `Window ${n} must sit inside the ${TEMPLATE_W} × ${TEMPLATE_H} template.`;
    }
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i]!, rects[j]!)) return `Windows ${i + 1} and ${j + 1} overlap.`;
    }
  }
  return null;
}

/** The scale at which a photo just covers its window (zoom 1). */
export const coverScale = (photo: Size, win: Size) => Math.max(win.w / photo.w, win.h / photo.h);

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom));

/** Keeps the photo covering the window: it may move only as far as its overhang on each side. */
export function clampPan(pan: Pan, zoom: number, photo: Size, win: Size): Pan {
  const s = coverScale(photo, win) * clampZoom(zoom);
  const mx = Math.max(0, (photo.w * s - win.w) / 2);
  const my = Math.max(0, (photo.h * s - win.h) / 2);
  return { x: Math.min(mx, Math.max(-mx, pan.x)), y: Math.min(my, Math.max(-my, pan.y)) };
}

/**
 * The part of the photo (in photo pixels) that shows in the window, for `drawImage`.
 * `pan` moves the photo: a positive x shows more of its left side.
 */
export function cropRect(photo: Size, win: Size, pan: Pan, zoom: number): Rect {
  const z = clampZoom(zoom);
  const p = clampPan(pan, z, photo, win);
  const s = coverScale(photo, win) * z;
  const w = win.w / s;
  const h = win.h / s;
  return { x: photo.w / 2 - p.x / s - w / 2, y: photo.h / 2 - p.y / s - h / 2, w, h };
}

/** "07 Nov 2026" for a `yyyy-mm-dd` date; null for none or a malformed value. */
export function formatEventDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** The event's saved windows, or the defaults when none are saved or the saved ones are invalid. */
export function windowsOf(saved: unknown): readonly Rect[] {
  if (!Array.isArray(saved)) return DEFAULT_WINDOWS;
  const rects = saved.map((r: Partial<Rect> | null) => ({ x: r?.x, y: r?.y, w: r?.w, h: r?.h }) as Rect);
  return windowsProblem(rects) ? DEFAULT_WINDOWS : rects;
}

/** Same-origin template address (a canvas can only read same-origin pixels): the admin's, or the default. */
export const stripTemplateUrl = (path: string | null | undefined) =>
  path ? `/strip/template?v=${encodeURIComponent(path)}` : "/strip/default-template.png";
