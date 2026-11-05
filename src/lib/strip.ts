/** Browser-side photo strip: draws the template, the 3 cropped photos and (default template) the names. */
import { STRIP_JPEG_QUALITY, THUMB_LONG_EDGE } from "./domain/limits";
import { cropRect, TEMPLATE_H, TEMPLATE_W, type Pan, type Rect } from "./domain/strip";
import { fitWithin } from "./domain/uploads";
import { MediaError } from "./media";

/**
 * Where the default template's text goes, in template px (public/strip/default-template.png leaves it out).
 * Each line is centred on `x`; `top` is the top of its line box (`size * lineHeight` tall), like CSS.
 * Colours are part of the fixed artwork, not the app theme.
 */
export const DEFAULT_TEMPLATE_TEXT = {
  names: { x: 540, top: 1500, size: 78, lineHeight: 1.1, color: "#5E1E2B" },
  date: { x: 540, top: 1596, size: 26, lineHeight: 1.5, letterSpacing: 6, color: "#5E1E2B" },
} as const;

export type StripPhoto = {
  source: CanvasImageSource & { width: number; height: number };
  pan: Pan;
  zoom: number;
};

export type StripText = {
  names: string;
  date: string | null;
  /** CSS font-family lists, e.g. the resolved value of the names / body font variables. */
  namesFont: string;
  dateFont?: string;
};

const FAILED = "The photo strip couldn’t be made. Please try again.";

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new MediaError(FAILED);
  return { canvas, ctx };
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaError(FAILED))), "image/jpeg", STRIP_JPEG_QUALITY),
  );

async function loadTemplate(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await createImageBitmap(await res.blob());
  } catch {
    throw new MediaError("The strip template couldn’t be loaded. Check your connection and try again.");
  }
}

async function drawText(ctx: CanvasRenderingContext2D, text: StripText) {
  const { names, date } = DEFAULT_TEMPLATE_TEXT;
  const namesFont = `${names.size}px ${text.namesFont}`;
  const dateFont = `${date.size}px ${text.dateFont ?? "system-ui, sans-serif"}`;
  // Canvas falls back silently to a default font if the web font is not loaded yet.
  await Promise.all([document.fonts?.load(namesFont), text.date && document.fonts?.load(dateFont)]).catch(() => {});
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = namesFont;
  ctx.fillStyle = names.color;
  ctx.fillText(text.names, names.x, names.top + (names.size * names.lineHeight) / 2);
  if (!text.date) return;
  ctx.font = dateFont;
  ctx.fillStyle = date.color;
  ctx.letterSpacing = `${date.letterSpacing}px`; // ignored where unsupported (iOS < 17): the date is just tighter
  ctx.fillText(text.date, date.x, date.top + (date.size * date.lineHeight) / 2);
}

/** The finished 1080 x 1920 strip and its thumbnail, both JPEG. */
export async function composeStrip(input: {
  templateUrl: string;
  windows: readonly Rect[];
  photos: readonly StripPhoto[];
  text: StripText | null;
}): Promise<{ image: Blob; thumb: Blob }> {
  const { canvas, ctx } = canvasOf(TEMPLATE_W, TEMPLATE_H);
  try {
    const template = await loadTemplate(input.templateUrl);
    try {
      ctx.drawImage(template, 0, 0, TEMPLATE_W, TEMPLATE_H);
    } finally {
      template.close();
    }
    input.windows.forEach((win, i) => {
      const photo = input.photos[i];
      if (!photo) return;
      const src = cropRect({ w: photo.source.width, h: photo.source.height }, win, photo.pan, photo.zoom);
      ctx.drawImage(photo.source, src.x, src.y, src.w, src.h, win.x, win.y, win.w, win.h);
    });
    if (input.text) await drawText(ctx, input.text);
    const image = await toJpeg(canvas);
    const size = fitWithin(TEMPLATE_W, TEMPLATE_H, THUMB_LONG_EDGE);
    const small = canvasOf(size.width, size.height);
    try {
      small.ctx.drawImage(canvas, 0, 0, size.width, size.height);
      return { image, thumb: await toJpeg(small.canvas) };
    } finally {
      small.canvas.width = 0;
    }
  } finally {
    canvas.width = 0; // iOS keeps canvas memory alive until it is shrunk
  }
}
