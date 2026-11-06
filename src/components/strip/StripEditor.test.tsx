import { act, fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WINDOWS } from "@/lib/domain/strip";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  post: vi.fn(),
  state: { status: "idle", progress: 0, preparing: false, busy: false, error: null as string | null },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("./usePostStrip", () => ({ usePostStrip: () => ({ ...mocks.state, post: mocks.post }) }));

import { StripEditor } from "./StripEditor";

const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const show = (text: { names: string; date: string | null } | null = { names: "Ali & Siti", date: "07 Nov 2026" }) =>
  render(<StripEditor templateUrl="/strip/default-template.png" windows={DEFAULT_WINDOWS} text={text} />);
const inputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
const flush = () => act(async () => {});
async function fill(n = 1) {
  for (let i = 0; i < n; i++) {
    fireEvent.change(inputs()[0]!, { target: { files: [jpg(`${i}.jpg`)] } });
    await flush();
  }
}
const photo = (n: number) => screen.getByRole("img", { name: new RegExp(`^Photo ${n}\\.`) });
const img = (n: number) => photo(n).querySelector("img")!;
const postButton = () => screen.getByRole("button", { name: /^post|preparing/i });
const at = (x: number, y: number, pointerId = 1) => ({ pointerId, clientX: x, clientY: y });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

let urls = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  mocks.state = { status: "idle", progress: 0, preparing: false, busy: false, error: null };
  mocks.post.mockResolvedValue(true);
  urls = 0;
  // 800 x 300 in a 500 x 375 window: cover scale 1.25, so 250 template px of overhang each side.
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 300, close: vi.fn() })));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${urls++}`), revokeObjectURL: vi.fn() }));
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StripEditor", () => {
  it("starts with three empty windows and Post disabled", () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 photos");
    for (const n of [1, 2, 3]) expect(screen.getByText(`Add photo ${n}`)).toBeInTheDocument();
    expect(inputs()[0]).toHaveAttribute("accept", "image/*");
    expect(inputs()[0]).not.toHaveAttribute("capture");
    expect(postButton()).toBeDisabled();
    expect(screen.getByText("Ali & Siti")).toHaveClass("font-script");
    expect(screen.getByText("07 Nov 2026")).toBeInTheDocument();
  });

  it("draws no names on a custom template", () => {
    show(null);
    expect(screen.queryByText("Ali & Siti")).not.toBeInTheDocument();
  });

  it("fills a window with the picked photo and shows the hint once", async () => {
    show();
    await fill();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 photos");
    expect(img(1)).toHaveAttribute("src", "blob:0");
    expect(Number.parseFloat(img(1).style.width)).toBeCloseTo(200); // 800 * 1.25 / 500
    expect(screen.getByText("Pinch to zoom · hold to remove")).toBeInTheDocument();
    await advance(2600);
    expect(screen.queryByText("Pinch to zoom · hold to remove")).not.toBeInTheDocument();
  });

  it("says when a photo cannot be read", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("no"))));
    show();
    await fill();
    expect(screen.getByRole("alert")).toHaveTextContent("This photo can’t be read");
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 photos");
  });

  it("pans with one finger, never past the photo's edge", async () => {
    show();
    await fill();
    fireEvent.pointerDown(photo(1), at(100, 100));
    fireEvent.pointerMove(photo(1), at(200, 100));
    expect(Number.parseFloat(img(1).style.left)).toBeCloseTo(-30); // 50% + 100/500 - 100%
    fireEvent.pointerMove(photo(1), at(900, 100));
    expect(Number.parseFloat(img(1).style.left)).toBeCloseTo(0); // clamped at the 250 px overhang
    fireEvent.pointerMove(photo(1), at(900, 400));
    expect(Number.parseFloat(img(1).style.top)).toBeCloseTo(0); // no vertical overhang at zoom 1
    fireEvent.pointerUp(photo(1), at(900, 400));
    await advance(500);
    expect(screen.queryByText("Drag here to remove")).not.toBeInTheDocument();
  });

  it("zooms with two fingers and with the wheel", async () => {
    show();
    await fill();
    fireEvent.pointerDown(photo(1), at(100, 100, 1));
    fireEvent.pointerDown(photo(1), at(200, 100, 2));
    fireEvent.pointerMove(photo(1), at(300, 100, 2));
    expect(Number.parseFloat(img(1).style.width)).toBeCloseTo(400); // zoom 2
    fireEvent.pointerUp(photo(1), at(300, 100, 2));
    fireEvent.pointerMove(photo(1), at(110, 100, 1)); // the finger left keeps panning
    fireEvent.pointerUp(photo(1), at(110, 100, 1));
    await advance(500);
    expect(screen.queryByText("Drag here to remove")).not.toBeInTheDocument(); // the pinch cancelled the hold
    fireEvent.wheel(photo(1), { deltaY: 100 });
    expect(Number.parseFloat(img(1).style.width)).toBeCloseTo(372); // 2 * 0.93
    fireEvent.wheel(photo(1), { deltaY: -100 });
    expect(Number.parseFloat(img(1).style.width)).toBeCloseTo(401.76);
  });

  it("removes a focused photo with Delete, and with the hidden Remove button", async () => {
    show();
    await fill(2);
    fireEvent.keyDown(photo(1), { key: "Enter" });
    expect(photo(1)).toBeInTheDocument();
    fireEvent.keyDown(photo(1), { key: "Delete" });
    expect(screen.getByText("Add photo 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(screen.getByText("Add photo 2")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("lifts a held photo and removes it when dropped on the bin", async () => {
    show();
    await fill();
    expect(fireEvent.contextMenu(photo(1))).toBe(false);
    fireEvent.pointerDown(photo(1), at(300, 300));
    await advance(450);
    expect(screen.getByText("Drag here to remove")).toBeInTheDocument();
    expect(screen.queryByText("Pinch to zoom · hold to remove")).not.toBeInTheDocument();
    expect(postButton().closest(".invisible")).not.toBeNull();
    // jsdom lays nothing out: the bin's centre is at (0, 0).
    fireEvent.pointerMove(photo(1), at(20, 20));
    expect(screen.getByText("Release to remove")).toBeInTheDocument();
    fireEvent.pointerUp(photo(1), at(20, 20));
    expect(screen.getByText("Add photo 1")).toBeInTheDocument();
    expect(screen.queryByText("Release to remove")).not.toBeInTheDocument();
  });

  it("snaps a held photo back when dropped elsewhere or cancelled", async () => {
    show();
    await fill();
    fireEvent.pointerDown(photo(1), at(300, 300));
    await advance(450);
    fireEvent.pointerMove(photo(1), at(300, 500));
    expect(photo(1).parentElement!.style.transform).toContain("translate(0px, 200px)");
    fireEvent.pointerUp(photo(1), at(300, 500));
    expect(photo(1)).toBeInTheDocument();
    expect(screen.queryByText("Drag here to remove")).not.toBeInTheDocument();

    fireEvent.pointerDown(photo(1), at(300, 300));
    await advance(450);
    fireEvent.pointerCancel(photo(1), at(300, 300));
    expect(screen.queryByText("Drag here to remove")).not.toBeInTheDocument();
    expect(photo(1)).toBeInTheDocument();
  });

  it("does not lift a photo that moved before the hold", async () => {
    show();
    await fill();
    fireEvent.pointerDown(photo(1), at(300, 300));
    fireEvent.pointerMove(photo(1), at(310, 300));
    await advance(500);
    expect(screen.queryByText("Drag here to remove")).not.toBeInTheDocument();
  });

  it("goes back straight away when empty, and asks first once a photo is placed", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.push).toHaveBeenCalledWith("/wall");
    mocks.push.mockClear();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Discard this strip?");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.push).toHaveBeenCalledWith("/wall");
  });

  it("posts the three photos in window order, then returns to the wall with a message", async () => {
    show();
    await fill(3);
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 photos");
    fireEvent.change(screen.getByLabelText("Caption (optional)"), { target: { value: "Us!" } });
    fireEvent.click(postButton());
    await flush();

    const input = mocks.post.mock.calls[0]![0];
    expect(input.photos.map((p: { file: File }) => p.file.name)).toEqual(["0.jpg", "1.jpg", "2.jpg"]);
    expect(input.photos[0]).toMatchObject({ pan: { x: 0, y: 0 }, zoom: 1 });
    expect(input).toMatchObject({ templateUrl: "/strip/default-template.png", windows: DEFAULT_WINDOWS, caption: "Us!" });
    expect(input.text).toMatchObject({ names: "Ali & Siti", date: "07 Nov 2026" });
    expect(sessionStorage.getItem("wm_flash")).toBe("Shared! Your photo strip is on the wall.");
    expect(mocks.push).toHaveBeenCalledWith("/wall");
  });

  it("stays on the page when posting fails", async () => {
    mocks.post.mockResolvedValue(false);
    show(null);
    await fill(3);
    fireEvent.click(postButton());
    await flush();
    expect(mocks.post.mock.calls[0]![0].text).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows progress and errors from the upload", () => {
    mocks.state = { status: "uploading", progress: 0.5, preparing: false, busy: true, error: "Upload didn’t finish." };
    show();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("alert")).toHaveTextContent("Upload didn’t finish.");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("says it is preparing", () => {
    mocks.state = { status: "idle", progress: 0, preparing: true, busy: true, error: null };
    show();
    expect(postButton()).toHaveTextContent("Preparing…");
  });

  it("starts empty again after Next hides the page and shows it later", async () => {
    const strip = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <StripEditor templateUrl="/strip/default-template.png" windows={DEFAULT_WINDOWS} text={null} />
      </Activity>
    );
    const { rerender } = render(strip("visible"));
    await fill(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3 photos");
    rerender(strip("hidden"));
    await flush();
    rerender(strip("visible"));
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 photos");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
