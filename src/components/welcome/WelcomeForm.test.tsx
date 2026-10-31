import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnownGuest } from "@/lib/api";
import { consumeWelcome } from "@/lib/welcome";
import { WelcomeForm } from "./WelcomeForm";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ALI: KnownGuest = { guestId: "a0000000-0000-4000-8000-000000000003", name: "Ali" };
const AINA: KnownGuest = { guestId: "a0000000-0000-4000-8000-000000000004", name: "Aina" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (data: unknown) => json({ ok: true, data }, 201);
const fail = (status: number, error: object) => json({ ok: false, error }, status);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  router.replace.mockReset();
  sessionStorage.clear(); // an earlier join leaves the welcome flag behind
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const body = (call = 0) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
const nameInput = () => screen.getByLabelText("Your name");
const start = () => screen.getByRole("button", { name: "Start" });

describe("WelcomeForm", () => {
  it("ignores input in the server-rendered HTML, which React would otherwise throw away on hydration", () => {
    const html = renderToString(<WelcomeForm known={[ALI]} />);
    expect(html).toMatch(/<input[^>]*readonly/i);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Start/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*><span[^>]*>Continue as/);
  });

  it("asks for a name and explains how identity works, with no password field", () => {
    render(<WelcomeForm known={[]} />);
    expect(nameInput()).toHaveAttribute("placeholder", "e.g. Aina from Kajang");
    expect(screen.getByText(/No password: this phone remembers you/)).toBeInTheDocument();
    expect(screen.queryByText(/This phone remembers you$/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("joins with the tidied-up name and goes to the wall", async () => {
    fetchMock.mockResolvedValue(ok({ guestId: "g1", name: "Aina from Kajang" }));
    render(<WelcomeForm known={[]} />);

    await userEvent.type(nameInput(), "  Aina   from Kajang ");
    await userEvent.click(start());

    expect(fetchMock.mock.calls[0][0]).toBe("/api/guests");
    expect(body()).toEqual({ name: "Aina from Kajang" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/wall"));
  });

  it("goes to the shared post it was sent from, without the wall's greeting", async () => {
    const next = "/p/b0000000-0000-4000-8000-000000000001";
    fetchMock.mockResolvedValue(ok({ guestId: "g1", name: "Aina" }));
    render(<WelcomeForm known={[]} next={next} />);

    await userEvent.type(nameInput(), "Aina");
    await userEvent.click(start());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(next));
    expect(consumeWelcome()).toBe(false);
  });

  it("continues as a known name straight to the shared post", async () => {
    const next = "/p/b0000000-0000-4000-8000-000000000001";
    fetchMock.mockResolvedValue(ok(ALI));
    render(<WelcomeForm known={[ALI]} next={next} />);

    await userEvent.click(screen.getByRole("button", { name: "Continue as Ali" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(next));
  });

  it("joins when the guest presses Enter", async () => {
    fetchMock.mockResolvedValue(ok({ guestId: "g1", name: "Ali" }));
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "Ali{Enter}");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/wall"));
  });

  it("stops a name that is too short before asking the server", async () => {
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "A");
    await userEvent.click(start());

    expect(await screen.findByRole("alert")).toHaveTextContent("Please enter at least 2 characters.");
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so when the name is too long, instead of silently cutting it", async () => {
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "a".repeat(30));
    expect(nameInput()).toHaveValue("a".repeat(30));
    await userEvent.click(start());
    expect(await screen.findByRole("alert")).toHaveTextContent("Names can be up to 24 characters.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts focus back on the name field when something needs fixing", async () => {
    render(<WelcomeForm known={[]} />);
    await userEvent.click(start());
    await screen.findByRole("alert");
    expect(nameInput()).toHaveFocus();
  });

  it("offers suggestions when the name is taken, and a tap fills the field", async () => {
    fetchMock.mockResolvedValue(
      fail(409, {
        code: "name_taken",
        message: "“Ali” is already used by another guest. Add something to make it yours.",
        details: { suggestions: ["Ali 2", "Ali & family"] },
      }),
    );
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "Ali");
    await userEvent.click(start());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“Ali” is already used by another guest. Add something to make it yours.",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(start()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Use “Ali & family”" }));
    expect(nameInput()).toHaveValue("Ali & family");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(nameInput()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("clears the error as soon as the guest edits the name", async () => {
    fetchMock.mockResolvedValue(fail(409, { code: "name_taken", message: "Taken." }));
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "Ali");
    await userEvent.click(start());
    expect(await screen.findByRole("alert")).toHaveTextContent("Taken.");

    await userEvent.type(nameInput(), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tells the guest what to do when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "Ali");
    await userEvent.click(start());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Check your connection/);
    expect(start()).toBeEnabled();
  });

  it("disables Start while the request is in flight", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    render(<WelcomeForm known={[]} />);
    await userEvent.type(nameInput(), "Ali");
    await userEvent.click(start());

    expect(await screen.findByRole("button", { name: "Starting…" })).toBeDisabled();
    finish(ok({ guestId: "g1", name: "Ali" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  describe("on a phone that already has names", () => {
    it("offers Continue as for each remembered name", () => {
      render(<WelcomeForm known={[ALI, AINA]} />);
      expect(screen.getByText("This phone remembers you")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue as Ali" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue as Aina" })).toBeInTheDocument();
    });

    it("signs in as that guest by id, without creating anyone", async () => {
      fetchMock.mockResolvedValue(json({ ok: true, data: AINA }));
      render(<WelcomeForm known={[ALI, AINA]} />);
      await userEvent.click(screen.getByRole("button", { name: "Continue as Aina" }));

      expect(fetchMock.mock.calls[0][0]).toBe("/api/session");
      expect(body()).toEqual({ guestId: AINA.guestId });
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/wall"));
    });

    it("treats typing one of this phone's own names as Continue as, ignoring case", async () => {
      fetchMock.mockResolvedValue(json({ ok: true, data: ALI }));
      render(<WelcomeForm known={[ALI]} />);
      await userEvent.type(nameInput(), "  ali ");
      await userEvent.click(start());

      expect(fetchMock.mock.calls[0][0]).toBe("/api/session");
      expect(body()).toEqual({ guestId: ALI.guestId });
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/wall"));
    });

    it("shows the server's message when Continue as is refused", async () => {
      fetchMock.mockResolvedValue(
        fail(403, { code: "unknown_guest", message: "This phone doesn’t remember that name." }),
      );
      render(<WelcomeForm known={[ALI]} />);
      await userEvent.click(screen.getByRole("button", { name: "Continue as Ali" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("doesn’t remember that name");
      expect(router.replace).not.toHaveBeenCalled();
    });
  });
});
