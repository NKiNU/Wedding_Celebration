import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";

const setup = (open: boolean) => {
  const props = { onPick: vi.fn(), onClose: vi.fn(), returnFocus: vi.fn() };
  const view = render(<ActionMenu open={open} {...props} />);
  return { ...props, ...view };
};
const menu = () => document.getElementById("share-menu")!;

describe("ActionMenu", () => {
  it("lists photos, video, wish and the DuitNow QR with their hints", () => {
    setup(true);
    expect(menu()).toHaveAttribute("aria-label", "Share something");
    const items = Array.from(menu().querySelectorAll("button")).map((b) => b.textContent);
    expect(items).toEqual([
      "Photos1 photo or an album",
      "VideoUp to 60 seconds",
      "WishWrite to the couple",
      "DuitNow QRSend a gift",
    ]);
  });

  it("stays in the DOM but out of reach while closed", () => {
    setup(false);
    expect(menu()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Close menu", hidden: true })).toHaveAttribute("inert");
  });

  it("is reachable while open", () => {
    setup(true);
    expect(menu()).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Close menu" })).not.toHaveAttribute("inert");
  });

  it("moves focus to the first item when it opens", () => {
    const { rerender, onPick, onClose, returnFocus } = setup(false);
    rerender(<ActionMenu open onPick={onPick} onClose={onClose} returnFocus={returnFocus} />);
    expect(screen.getByRole("button", { name: /^Photos/ })).toHaveFocus();
  });

  it("closes on the scrim and on Escape, but only listens for Escape while open", () => {
    const open = setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(open.onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(open.onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(open.onClose).toHaveBeenCalledTimes(2);
    open.unmount();

    const closed = setup(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed.onClose).not.toHaveBeenCalled();
  });

  it.each([
    [/^Photos/, "photos"],
    [/^Video/, "video"],
    [/^Wish/, "wish"],
    [/^DuitNow QR/, "qr"],
  ] as const)("picks %s after handing focus back to the FAB", (name, kind) => {
    const { onPick, returnFocus } = setup(true);
    fireEvent.click(screen.getByRole("button", { name }));
    expect(onPick).toHaveBeenCalledWith(kind);
    // the dialog that opens next must record the FAB, not a removed menu button, as its opener
    expect(returnFocus.mock.invocationCallOrder[0]).toBeLessThan(onPick.mock.invocationCallOrder[0]);
  });

  it("keeps only the DuitNow QR, with a note, while uploads are closed", () => {
    const props = { onPick: vi.fn(), onClose: vi.fn(), returnFocus: vi.fn() };
    render(<ActionMenu open uploadsOpen={false} {...props} />);
    const items = Array.from(menu().querySelectorAll("button")).map((b) => b.textContent);
    expect(items).toEqual(["DuitNow QRSend a gift"]);
    expect(screen.getByText(/Sharing is closed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^DuitNow QR/ })).toHaveFocus();
  });
});
