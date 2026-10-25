import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { WallHeader } from "./WallHeader";

describe("WallHeader", () => {
  it("names the couple, the guest, the header message and the memory count", () => {
    render(<WallHeader groom="Hafiz" bride="Aisyah" headerMessage="Raikan memori" memories={3} me="Aina" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hafiz & Aisyah");
    expect(screen.getByText("Raikan memori · 3 memories shared")).toBeInTheDocument();
    expect(screen.getByText("Aina")).toBeInTheDocument();
  });

  it("uses the singular and survives a missing header message", () => {
    render(<WallHeader groom="H" bride="A" headerMessage={null} memories={1} me="Aina" />);
    expect(screen.getByText("1 memory shared")).toBeInTheDocument();
  });

  it("renders the ticker slot", () => {
    render(
      <WallHeader groom="H" bride="A" headerMessage={null} memories={0} me="Aina">
        <p>ticker</p>
      </WallHeader>,
    );
    expect(screen.getByText("ticker")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it.each([
    ["all", "No memories yet"],
    ["photos", "No photos yet"],
    ["videos", "No videos yet"],
    ["wishes", "No wishes yet"],
  ] as const)("explains an empty %s filter", (filter, title) => {
    render(<EmptyState filter={filter} />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
