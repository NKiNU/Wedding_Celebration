import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrDrawer, type QrInfo } from "./QrDrawer";

const QR: QrInfo = { available: true, accountName: "Nazrul & Aina", bank: "Maybank" };
const png = () => new Blob(["x"], { type: "image/png" });

const show = (over: Partial<React.ComponentProps<typeof QrDrawer>> = {}) =>
  render(<QrDrawer open qr={QR} onClose={vi.fn()} {...over} />);

const setNavigator = (share?: (data: ShareData) => Promise<void>, canShare = true) => {
  Object.defineProperty(navigator, "canShare", { value: share ? () => canShare : undefined, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
};

beforeEach(() => {
  // A plain object, not a `Response`: undici's Blob is not the jsdom Blob that `new File([blob])` accepts.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => png() })));
  setNavigator();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QrDrawer", () => {
  it("shows the QR with the holder's name, the bank and the three steps", () => {
    show();
    expect(screen.getByRole("img", { name: "DuitNow QR for Nazrul & Aina" })).toHaveAttribute("src", "/qr");
    expect(screen.getByText("Maybank")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/long-press the QR/)).toBeInTheDocument();
  });

  it("says so while the couple has not added a QR, and never fetches one", () => {
    show({ qr: { available: false, accountName: null, bank: null } });
    expect(screen.getByText(/hasn’t added their DuitNow QR yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download QR" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to 'the couple' when there is no account name", () => {
    show({ qr: { available: true, accountName: null, bank: null } });
    expect(screen.getByRole("img")).toHaveAttribute("alt", "DuitNow QR for the couple");
  });

  it("does not fetch the QR until the drawer opens", () => {
    show({ open: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares the file through the share sheet when the phone can", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    setNavigator(share);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/qr"));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]![0];
    expect(data.files![0]!.name).toBe("duitnow-qr.png");
    expect(data.files![0]!.type).toBe("image/png");
  });

  it("downloads through a link when the phone cannot share files", async () => {
    setNavigator(vi.fn(async () => {}), false);
    URL.createObjectURL = vi.fn(() => "blob:qr");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    expect(click).toHaveBeenCalled();
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it("falls back to the plain /qr link when the file never arrived", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    expect(click).toHaveBeenCalled();
    expect(click.mock.contexts[0]).toHaveProperty("href", expect.stringMatching(/\/qr$/));
  });

  it("does nothing more when the guest closes the share sheet", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("closed", "AbortError");
    });
    setNavigator(share);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(click).not.toHaveBeenCalled();
  });

  it("still downloads when sharing fails for another reason", async () => {
    setNavigator(vi.fn(async () => {
      throw new DOMException("no", "NotAllowedError");
    }));
    URL.createObjectURL = vi.fn(() => "blob:qr");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    show();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
  });

  it("explains when the image cannot be loaded", () => {
    show();
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t be loaded/);
  });

  it("tries the image again each time the drawer opens after a failed load", () => {
    const { rerender } = show();
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<QrDrawer open={false} qr={QR} onClose={vi.fn()} />);
    rerender(<QrDrawer open qr={QR} onClose={vi.fn()} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    show({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
