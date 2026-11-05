import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewerSkeleton } from "./ViewerSkeleton";

describe("ViewerSkeleton", () => {
  it("shows the viewer's shape, says it is loading, and back works at once", () => {
    render(<ViewerSkeleton />);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading memory…");
    expect(screen.getByRole("link", { name: "Back to memories" })).toHaveAttribute("href", "/wall");
  });
});
