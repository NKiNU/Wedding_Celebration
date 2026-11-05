import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEvent } from "@/lib/api";

const mocks = vi.hoisted(() => ({ api: vi.fn(), putFile: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/upload", () => ({ putFile: mocks.putFile }));

import { StripTemplateSection } from "./StripTemplateSection";
import { useStripTemplate } from "./useStripTemplate";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (code: string, message = code) => ({ ok: false as const, error: { code, message } });

const DEFAULTS = [
  { x: 290, y: 250, w: 500, h: 375 },
  { x: 290, y: 665, w: 500, h: 375 },
  { x: 290, y: 1080, w: 500, h: 375 },
];
const EVENT: AdminEvent = {
  groomName: "Groom",
  brideName: "Bride",
  headerMessage: "",
  uploadsOpen: true,
  qrAccountName: "",
  qrBank: "",
  hasQr: false,
  fonts: { names: "pinyon-script", wishes: "cormorant-garamond", body: "poppins" },
  monogramUrl: null,
  stripTemplateUrl: "/strip/default-template.png",
  hasStripTemplate: false,
  stripWindows: DEFAULTS,
  eventDate: "2026-11-07",
};
const CUSTOM: AdminEvent = { ...EVENT, hasStripTemplate: true, stripTemplateUrl: "/strip/template?v=k" };

const show = (event: AdminEvent = EVENT, save = vi.fn().mockResolvedValue(null), onChanged = vi.fn()) => {
  render(<StripTemplateSection event={event} saving={false} save={save} onChanged={onChanged} />);
  return { save, onChanged };
};
const win = (n: number) => screen.getByRole("button", { name: new RegExp(`^Window ${n},`) });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const setField = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } });
  fireEvent.blur(field(label));
};

beforeEach(() => {
  mocks.api.mockReset();
  mocks.putFile.mockReset();
});

describe("StripTemplateSection", () => {
  it("shows the default template with the three windows and no 'Use default' button", () => {
    show();
    expect(screen.getByAltText("Default strip template")).toHaveAttribute("src", "/strip/default-template.png");
    expect(win(1)).toHaveAccessibleName("Window 1, x 290, y 250, 500 by 375. Arrow keys move it.");
    expect(win(1)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Upload template")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use default template" })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute("accept", "image/png,image/jpeg");
    expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
  });

  it("arrow keys move the focused window by 10 px, Shift by 50, and Save layout sends the windows", async () => {
    const { save } = show();
    act(() => win(2).focus());
    expect(win(2)).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(win(2), { key: "ArrowRight" });
    fireEvent.keyDown(win(2), { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(win(2), { key: "Tab" });
    expect(win(2)).toHaveAccessibleName(/x 250, y 665/);
    expect(field("X").value).toBe("250");
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ stripWindows: [DEFAULTS[0], { ...DEFAULTS[1], x: 250 }, DEFAULTS[2]] }),
    );
  });

  it("keeps windows inside the template", () => {
    show();
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(win(1), { key: "ArrowUp", shiftKey: true });
    expect(win(1)).toHaveAccessibleName(/y 0,/);
  });

  it("with 'Same size' on, a new width applies to all three; off, only to the selected one", () => {
    show();
    const same = screen.getByRole("checkbox", { name: "Same size for all three windows" });
    expect(same).toBeChecked();
    setField("Width", "400");
    for (const n of [1, 2, 3]) expect(win(n)).toHaveAccessibleName(/400 by 375/);
    fireEvent.click(same);
    setField("Height", "300");
    expect(win(1)).toHaveAccessibleName(/400 by 300/);
    expect(win(2)).toHaveAccessibleName(/400 by 375/);
  });

  it("number fields clamp to the minimum size and ignore an empty value", () => {
    show();
    setField("Width", "10");
    expect(win(1)).toHaveAccessibleName(/160 by 375/);
    setField("Y", "");
    expect(field("Y").value).toBe("250");
    fireEvent.keyDown(field("X"), { key: "Enter" });
  });

  it("shows an overlap inline and blocks saving; Reset brings the defaults back", () => {
    show();
    setField("Y", "500");
    expect(screen.getByRole("alert")).toHaveTextContent("Windows 1 and 2 overlap.");
    expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(win(1)).toHaveAccessibleName(/y 250/);
  });

  it("drags a window to move it and its corner to resize it, in template pixels", () => {
    show();
    const stage = win(1).parentElement!;
    // jsdom has no layout, so the preview counts as 260 px wide: 1 screen px = 1080/260 template px.
    fireEvent.pointerDown(win(3), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 26, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(win(3)).toHaveAccessibleName(/x 398, y 1080/);
    expect(win(3)).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100 });
    expect(win(3)).toHaveAccessibleName(/x 398, y 1080/);

    fireEvent.pointerDown(screen.getByTestId("resize-handle"), { clientX: 0, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(stage, { clientX: -26, clientY: -26, pointerId: 2 });
    fireEvent.pointerCancel(stage, { pointerId: 2 });
    for (const n of [1, 2, 3]) expect(win(n)).toHaveAccessibleName(/392 by 267/);
  });

  it("shows why saving the layout failed", async () => {
    show(EVENT, vi.fn().mockResolvedValue("Nope."));
    fireEvent.keyDown(win(1), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Save layout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
  });

  it("saves the wedding date, shows it as the template will, and clears it to null", async () => {
    const { save } = show();
    expect(screen.getByText("Shown on the default template as “07 Nov 2026”.")).toBeInTheDocument();
    const saveDate = screen.getByRole("button", { name: "Save date" });
    expect(saveDate).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Wedding date"), { target: { value: "2026-11-08" } });
    expect(screen.getByText("Shown on the default template as “08 Nov 2026”.")).toBeInTheDocument();
    fireEvent.click(saveDate);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ eventDate: "2026-11-08" }));
    fireEvent.change(screen.getByLabelText("Wedding date"), { target: { value: "" } });
    expect(screen.getByText("Shown on the default template.")).toBeInTheDocument();
    fireEvent.click(saveDate);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ eventDate: null }));
  });

  it("shows why saving the date failed", async () => {
    show({ ...EVENT, eventDate: null }, vi.fn().mockResolvedValue("Bad date."));
    fireEvent.change(screen.getByLabelText("Wedding date"), { target: { value: "2026-11-08" } });
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bad date.");
  });

  it("uploads a template: presign, put with progress, confirm", async () => {
    mocks.api.mockResolvedValueOnce(ok({ key: "k", url: "https://r2.test/k" })).mockResolvedValueOnce(ok(CUSTOM));
    mocks.putFile.mockResolvedValue(undefined);
    const { onChanged } = show();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "t.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(CUSTOM));
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/strip-template", "POST", { mime: "image/jpeg", bytes: 1 });
    expect(mocks.putFile).toHaveBeenCalledWith("https://r2.test/k", expect.any(File), "image/jpeg", expect.any(Function));
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/strip-template", "PUT", { key: "k" });
  });

  it("shows the server's size message when the template is the wrong size", async () => {
    const msg = "The template must be 1080 × 1920 px (Instagram story size). Yours is 1080 × 1350.";
    mocks.api.mockResolvedValueOnce(ok({ key: "k", url: "u" })).mockResolvedValueOnce(fail("wrong_size", msg));
    mocks.putFile.mockResolvedValue(undefined);
    show();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "t.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });

  it("refuses a WebP before calling the server", async () => {
    show();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "t.webp", { type: "image/webp" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/PNG or JPG/);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("'Use default template' asks first, then calls DELETE", async () => {
    mocks.api.mockResolvedValue(ok(EVENT));
    const { onChanged } = show(CUSTOM);
    expect(screen.getByAltText("Your strip template")).toHaveAttribute("src", CUSTOM.stripTemplateUrl);
    expect(screen.getByText("Replace template")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use default template" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Keep mine" }));
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use default template" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Use default" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/admin/strip-template", "DELETE"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(EVENT));
  });
});

describe("useStripTemplate", () => {
  const file = new File(["x"], "t.png", { type: "image/png" });

  it("reports a failed presign, a failed upload and a failed remove", async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStripTemplate(onDone));
    mocks.api.mockResolvedValueOnce(fail("invalid_input", "Too big."));
    await act(() => result.current.upload(file));
    expect(result.current.error).toBe("Too big.");

    mocks.api.mockResolvedValueOnce(ok({ key: "k", url: "u" }));
    mocks.putFile.mockRejectedValueOnce("boom");
    await act(() => result.current.upload(file));
    expect(result.current.error).toBe("The upload failed. Please try again.");

    mocks.api.mockResolvedValueOnce(fail("internal", "Could not remove."));
    await act(() => result.current.remove());
    expect(result.current.error).toBe("Could not remove.");
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.progress).toBeNull();
  });
});
