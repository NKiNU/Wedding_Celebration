import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are off, so RTL cannot register its own auto-cleanup.
afterEach(cleanup);

// jsdom has no <dialog> behaviour. This covers what BottomSheet relies on: open state, the close
// event, and focus returning to the element that was focused when the dialog opened.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  const opener = new WeakMap<HTMLDialogElement, Element | null>();
  HTMLDialogElement.prototype.showModal = function showModal() {
    opener.set(this, document.activeElement);
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    (opener.get(this) as HTMLElement | null)?.focus?.();
    this.dispatchEvent(new Event("close"));
  };
}
