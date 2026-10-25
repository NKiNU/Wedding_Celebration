import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState call to action", () => {
  it("has no button when nobody listens", () => {
    render(<EmptyState filter="all" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    ["all", "Share a memory", "menu"],
    ["photos", "Add photos", "photos"],
    ["videos", "Add a video", "video"],
    ["wishes", "Write a wish", "wish"],
  ] as const)("on %s offers %s", (filter, label, kind) => {
    const onAction = vi.fn();
    render(<EmptyState filter={filter} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onAction).toHaveBeenCalledWith(kind);
  });
});
