import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_GATE_MS, fontGate } from "./fontGate";

const state = () => document.documentElement.getAttribute("data-fonts");

function addChoice() {
  const style = document.createElement("style");
  style.setAttribute("data-font-choice", "");
  document.body.append(style);
}

describe("fontGate", () => {
  const original = Object.getOwnPropertyDescriptor(document, "fonts");
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.setAttribute("data-fonts", "loading");
    document.documentElement.style.setProperty("--font-body", "Poppins");
    document.documentElement.style.setProperty("--font-script", "Pinyon");
    document.documentElement.style.setProperty("--font-serif", "Cormorant");
    load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    if (original) Object.defineProperty(document, "fonts", original);
    else delete (document as { fonts?: unknown }).fonts;
  });

  it("waits for the chosen fonts' style, then loads body, script and italic serif", async () => {
    fontGate(document, FONT_GATE_MS);
    await vi.advanceTimersByTimeAsync(200);
    expect(load).not.toHaveBeenCalled();
    expect(state()).toBe("loading");

    addChoice();
    await vi.advanceTimersByTimeAsync(60);
    expect(load.mock.calls.map((c) => String(c[0]).trim())).toEqual([
      "16px Poppins",
      "16px Pinyon",
      "italic 16px Cormorant",
    ]);
    expect(state()).toBe("ready");
  });

  it("shows the text anyway when a font fails to load", async () => {
    load.mockImplementation(() => Promise.reject(new Error("offline")));
    addChoice();
    fontGate(document, FONT_GATE_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(state()).toBe("ready");
  });

  it("never holds the skeleton past the limit", async () => {
    load.mockImplementation(() => new Promise(() => {}));
    fontGate(document, FONT_GATE_MS);
    await vi.advanceTimersByTimeAsync(FONT_GATE_MS - 1);
    expect(state()).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    expect(state()).toBe("ready");
    addChoice(); // arriving late changes nothing
    await vi.advanceTimersByTimeAsync(100);
    expect(load).not.toHaveBeenCalled();
  });

  it("shows the text at once on a browser without the font loading API", () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: undefined });
    fontGate(document, FONT_GATE_MS);
    expect(state()).toBe("ready");
  });

  it("is self-contained, so layout.tsx can inline it as a script", () => {
    const run = new Function("document", `(${fontGate.toString()})(document, 0)`);
    run(document);
    vi.advanceTimersByTime(0);
    expect(state()).toBe("ready");
  });
});
