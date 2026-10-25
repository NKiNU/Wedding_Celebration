import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WelcomeHeader } from "./WelcomeHeader";

describe("WelcomeHeader", () => {
  it("names the couple as the page heading", () => {
    render(<WelcomeHeader groom="Hafiz" bride="Aisyah" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hafiz & Aisyah");
    expect(screen.getByText("Share celebration memories of")).toBeInTheDocument();
  });

  it("draws the monogram from their initials, hidden from screen readers", () => {
    render(<WelcomeHeader groom=" hafiz" bride="aisyah" />);
    const monogram = screen.getByText("H").closest("[aria-hidden]");
    expect(monogram).toHaveAttribute("aria-hidden", "true");
    expect(monogram).toHaveTextContent("HA");
  });
});
