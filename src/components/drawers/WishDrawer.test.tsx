import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postWish: vi.fn(),
  reset: vi.fn(),
  state: { status: "idle", error: null as string | null },
}));
vi.mock("./useCreatePost", () => ({
  useCreatePost: () => ({ ...mocks.state, progress: 0, postWish: mocks.postWish, reset: mocks.reset }),
}));

import { WishDrawer } from "./WishDrawer";

const show = (over = {}) => {
  const props = { open: true, me: "Aina", onClose: vi.fn(), onPosted: vi.fn(), ...over };
  render(<WishDrawer {...props} />);
  return props;
};
const field = () => screen.getByLabelText("Your wish") as HTMLTextAreaElement;
const send = () => screen.getByRole("button", { name: /send wish|sending/i });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { status: "idle", error: null };
  mocks.postWish.mockResolvedValue(true);
});

describe("WishDrawer", () => {
  it("says who the wish is from and counts characters", () => {
    show();
    expect(screen.getByText("Aina")).toBeInTheDocument();
    expect(screen.getByText("0 / 300")).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: "Selamat!" } });
    expect(screen.getByText("8 / 300")).toBeInTheDocument();
  });

  it("keeps Send disabled until the wish has 3 characters", () => {
    show();
    expect(send()).toBeDisabled();
    fireEvent.change(field(), { target: { value: "  ab " } });
    expect(send()).toBeDisabled();
    fireEvent.change(field(), { target: { value: "abc" } });
    expect(send()).toBeEnabled();
  });

  it("appends a quick-start chip to what is already written, within 300 characters", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "+ Congratulations!" }));
    expect(field().value).toBe("Congratulations!");
    fireEvent.click(screen.getByRole("button", { name: "+ Selamat pengantin baru" }));
    expect(field().value).toBe("Congratulations! Selamat pengantin baru");
    fireEvent.change(field(), { target: { value: "x".repeat(295) } });
    fireEvent.click(screen.getByRole("button", { name: "+ Congratulations!" }));
    expect(field().value).toHaveLength(300);
  });

  it("sends the trimmed wish, clears the field and reports it", async () => {
    const { onPosted } = show();
    fireEvent.change(field(), { target: { value: "  Congratulations!  " } });
    fireEvent.click(send());
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce());
    expect(mocks.postWish).toHaveBeenCalledWith("Congratulations!");
    expect(field().value).toBe("");
  });

  it("keeps the text and does not report when sending fails", async () => {
    mocks.postWish.mockResolvedValue(false);
    mocks.state = { status: "idle", error: "Can’t reach the server." };
    const { onPosted } = show();
    fireEvent.change(field(), { target: { value: "Congratulations!" } });
    fireEvent.click(send());
    await waitFor(() => expect(mocks.postWish).toHaveBeenCalled());
    expect(onPosted).not.toHaveBeenCalled();
    expect(field().value).toBe("Congratulations!");
    expect(screen.getByRole("alert")).toHaveTextContent("Can’t reach the server.");
  });

  it("disables Send while the request runs", () => {
    mocks.state = { status: "posting", error: null };
    show();
    fireEvent.change(field(), { target: { value: "Congratulations!" } });
    expect(send()).toBeDisabled();
    expect(send()).toHaveTextContent("Sending…");
  });

  it("clears the draft and the error when closed", () => {
    const { onClose } = show();
    fireEvent.change(field(), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
    expect(field().value).toBe("");
  });
});
