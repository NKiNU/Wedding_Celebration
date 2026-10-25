import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

const counts = { all: 10, photos: 4, videos: 1, wishes: 5 };

describe("FilterBar", () => {
  it("shows every pill with its count and marks the active one", () => {
    render(<FilterBar counts={counts} value="videos" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All 10" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Photos 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Videos 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wishes 5" })).toBeInTheDocument();
  });

  it("reports the chosen filter", () => {
    const onChange = vi.fn();
    render(<FilterBar counts={counts} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Wishes 5" }));
    expect(onChange).toHaveBeenCalledWith("wishes");
  });
});
