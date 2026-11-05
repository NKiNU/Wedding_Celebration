import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => status }));

import { LinkPending } from "./LinkPending";

describe("LinkPending", () => {
  it("draws nothing until the link is loading", () => {
    status.pending = false;
    expect(render(<LinkPending />).container).toBeEmptyDOMElement();
  });

  it("covers the card with a spinner while the viewer loads, hidden from screen readers", () => {
    status.pending = true;
    const overlay = render(<LinkPending />).container.firstElementChild;
    expect(overlay).toHaveClass("pending-in");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
  });
});
