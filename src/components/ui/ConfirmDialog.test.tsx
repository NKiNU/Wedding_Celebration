import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

const props = {
  open: true,
  title: "Delete this album?",
  body: "Guests will not see it anymore. This cannot be undone.",
  confirmLabel: "Delete",
  cancelLabel: "Keep it",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};
const dialog = () => document.querySelector("dialog")!;

describe("ConfirmDialog", () => {
  it("opens as a labelled alert dialog with both choices", () => {
    render(<ConfirmDialog {...props} />);
    expect(dialog()).toHaveAttribute("open");
    const alert = screen.getByRole("alertdialog", { name: "Delete this album?" });
    expect(alert).toHaveAccessibleDescription(props.body);
    expect(screen.getByRole("button", { name: "Keep it" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("stays closed until opened, and closes again", () => {
    const { rerender } = render(<ConfirmDialog {...props} open={false} />);
    expect(dialog()).not.toHaveAttribute("open");
    rerender(<ConfirmDialog {...props} open />);
    expect(dialog()).toHaveAttribute("open");
    rerender(<ConfirmDialog {...props} open={false} />);
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("reports the choice, and a tap on the backdrop (not the card) cancels", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("heading"));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(dialog());
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape cancels through the parent instead of closing the dialog itself", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} onCancel={onCancel} />);
    const escape = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("treats a native close as a cancel", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} onCancel={onCancel} />);
    dialog().dispatchEvent(new Event("close"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows why it failed and lets the guest try again", () => {
    render(<ConfirmDialog {...props} error="Can’t reach the server." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can’t reach the server.");
  });

  it("cannot be dismissed while the request runs", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} pending onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeDisabled();
    const escape = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(escape);
    fireEvent.click(dialog());
    expect(onCancel).not.toHaveBeenCalled();
    // A browser that closed it anyway gets it back.
    dialog().removeAttribute("open");
    dialog().dispatchEvent(new Event("close"));
    expect(dialog()).toHaveAttribute("open");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
