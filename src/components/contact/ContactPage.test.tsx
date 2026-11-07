import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactPage } from "./ContactPage";

describe("ContactPage", () => {
  it("links to WhatsApp, the phone, Instagram and back to the wall", () => {
    render(<ContactPage />);
    expect(screen.getByRole("heading", { name: "Want this app for your wedding?" })).toBeInTheDocument();
    const chat = screen.getByRole("link", { name: "Chat on WhatsApp" });
    expect(chat).toHaveAttribute("href", "https://wa.me/601133460253?text=Hi%20Nik%2C%20I%20saw%20the%20Wedding%20Memories%20app%20and%20I'm%20interested.");
    expect(chat).toHaveAttribute("target", "_blank");
    expect(chat.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "Call Nik" })).toHaveAttribute("href", "tel:+601133460253");
    const insta = screen.getByRole("link", { name: "Follow on Instagram" });
    expect(insta).toHaveAttribute("href", "https://www.instagram.com/0204.nothim");
    expect(insta).toHaveAttribute("target", "_blank");
    expect(screen.getByText("@0204.nothim")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to memories" })).toHaveAttribute("href", "/wall");
  });
});
