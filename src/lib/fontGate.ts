/** Longest a guest waits on the text skeleton; after this the page shows whatever fonts have arrived. */
export const FONT_GATE_MS = 2500;

/**
 * Holds `<html data-fonts="loading">` (text drawn as `.bone` shimmer bars) until the event's chosen
 * fonts are in, then sets `data-fonts="ready"` so every line appears once, in its real face.
 *
 * It waits for the `<style data-font-choice>` that ThemeStyle streams in (without it the default
 * fonts would load, then swap again), then loads the body, script and italic serif faces. It never
 * waits past `maxMs`, so slow venue Wi-Fi gets text, not a skeleton.
 *
 * Runs as an inline script in <head>, before React, so it must stay self-contained: no imports,
 * no closures over module scope. layout.tsx inlines it with `Function.prototype.toString`.
 */
export function fontGate(doc: Document, maxMs: number): void {
  const root = doc.documentElement;
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    root.setAttribute("data-fonts", "ready");
  };
  setTimeout(ready, maxMs);
  const fonts = doc.fonts;
  if (!fonts || typeof fonts.load !== "function") return ready();
  const start = () => {
    if (done) return;
    if (!doc.querySelector("style[data-font-choice]")) {
      setTimeout(start, 50);
      return;
    }
    const css = getComputedStyle(root);
    const faces = [
      "16px " + css.getPropertyValue("--font-body"),
      "16px " + css.getPropertyValue("--font-script"),
      "italic 16px " + css.getPropertyValue("--font-serif"),
    ];
    Promise.all(faces.map((face) => fonts.load(face))).then(ready, ready);
  };
  start();
}
