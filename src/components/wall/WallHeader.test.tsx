import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";
import { WallHeader } from "./WallHeader";

describe("WallHeader", () => {
  it("names the couple, the guest, the header message and the memory count", () => {
    render(<WallHeader groom="Hafiz" bride="Aisyah" headerMessage="Raikan memori" memories={3} me="Aina" onOpenMe={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hafiz & Aisyah");
    expect(screen.getByText("Raikan memori · 3 memories shared")).toBeInTheDocument();
    expect(screen.getByText("Aina")).toBeInTheDocument();
  });

  it("makes the name chip the button that opens the Me drawer", () => {
    const onOpenMe = vi.fn();
    render(<WallHeader groom="H" bride="A" headerMessage={null} memories={0} me="Aina" onOpenMe={onOpenMe} />);
    fireEvent.click(screen.getByRole("button", { name: "Your name and posts, Aina" }));
    expect(onOpenMe).toHaveBeenCalledOnce();
  });

  it("uses the singular and survives a missing header message", () => {
    render(<WallHeader groom="H" bride="A" headerMessage={null} memories={1} me="Aina" onOpenMe={vi.fn()} />);
    expect(screen.getByText("1 memory shared")).toBeInTheDocument();
  });

  it("shows the monogram image instead of the initials", () => {
    const { container } = render(
      <WallHeader groom="Hafiz" bride="Aisyah" headerMessage={null} memories={0} me="Aina" monogramUrl="https://media.test/mono.png" onOpenMe={vi.fn()} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://media.test/mono.png");
    expect(screen.queryByText("HA")).toBeNull();
  });

  it("renders the ticker slot", () => {
    render(
      <WallHeader groom="H" bride="A" headerMessage={null} memories={0} me="Aina" onOpenMe={vi.fn()}>
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
