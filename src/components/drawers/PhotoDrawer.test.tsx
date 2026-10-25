import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postMedia: vi.fn(),
  reset: vi.fn(),
  preparePhoto: vi.fn(),
  state: { status: "idle", progress: 0, error: null as string | null },
}));
vi.mock("./useCreatePost", () => ({
  useCreatePost: () => ({ ...mocks.state, postMedia: mocks.postMedia, reset: mocks.reset }),
}));
vi.mock("@/lib/media", () => ({
  preparePhoto: mocks.preparePhoto,
  MediaError: class MediaError extends Error {},
}));

import { MediaError } from "@/lib/media";
import { PhotoDrawer } from "./PhotoDrawer";

const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const show = () => {
  const props = { open: true, onClose: vi.fn(), onPosted: vi.fn() };
  render(<PhotoDrawer {...props} />);
  return props;
};
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (...files: File[]) => fireEvent.change(input(), { target: { files } });
const post = () => screen.getByRole("button", { name: /^post|preparing/i });

let urls = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { status: "idle", progress: 0, error: null };
  mocks.postMedia.mockResolvedValue(true);
  mocks.preparePhoto.mockImplementation(async () => ({
    main: new Blob(["m"]),
    thumb: new Blob(["t"]),
    width: 2048,
    height: 1536,
  }));
  urls = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${urls++}`), revokeObjectURL: vi.fn() }));
});

describe("PhotoDrawer", () => {
  it("starts empty with Post disabled", () => {
    show();
    expect(screen.getByText("Choose photos")).toBeInTheDocument();
    expect(post()).toBeDisabled();
    expect(post()).toHaveTextContent("Post photo");
  });

  it("previews picked photos and says several make an album", () => {
    show();
    pick(jpg("a.jpg"));
    expect(screen.getByText("1 photo selected")).toBeInTheDocument();
    expect(screen.getByText("Add more to make an album")).toBeInTheDocument();
    pick(jpg("b.jpg"), jpg("c.jpg"));
    expect(screen.getByText("3 photos selected")).toBeInTheDocument();
    expect(screen.getByText("Will post as an album")).toBeInTheDocument();
    expect(post()).toHaveTextContent("Post album (3)");
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("keeps the first 10 and says so", () => {
    show();
    pick(...Array.from({ length: 12 }, (_, i) => jpg(`${i}.jpg`)));
    expect(screen.getByText("10 photos selected")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Up to 10 photos per post.");
    expect(input()).toBeDisabled();
  });

  it("removes a photo and releases its preview", () => {
    show();
    pick(jpg("a.jpg"), jpg("b.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    expect(screen.getByText("1 photo selected")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:0");
  });

  it("prepares each photo, posts main and thumb files in order, then reports the type", async () => {
    const { onPosted } = show();
    pick(jpg("a.jpg"), jpg("b.jpg"));
    fireEvent.change(screen.getByLabelText(/caption/i), { target: { value: "Akad nikah" } });
    fireEvent.click(post());

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith("album"));
    const [items, caption] = mocks.postMedia.mock.calls[0]!;
    expect(caption).toBe("Akad nikah");
    expect(items.map((i: { role: string; position: number }) => `${i.role}${i.position}`)).toEqual(["main0", "thumb0", "main1", "thumb1"]);
    expect(items[0]).toMatchObject({ mime: "image/jpeg", width: 2048, height: 1536 });
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("names the photo that can’t be read and posts nothing", async () => {
    mocks.preparePhoto.mockResolvedValueOnce({ main: new Blob(["m"]), thumb: new Blob(["t"]), width: 1, height: 1 });
    mocks.preparePhoto.mockRejectedValueOnce(new MediaError("This photo can’t be read. Try another one."));
    const { onPosted } = show();
    pick(jpg("a.jpg"), jpg("b.heic"));
    fireEvent.click(post());

    expect(await screen.findByRole("alert")).toHaveTextContent("Photo 2: This photo can’t be read.");
    expect(mocks.postMedia).not.toHaveBeenCalled();
    expect(onPosted).not.toHaveBeenCalled();
    expect(screen.getByText("2 photos selected")).toBeInTheDocument();
  });

  it("keeps the photos and shows the server error when posting fails", async () => {
    mocks.postMedia.mockResolvedValue(false);
    mocks.state = { status: "idle", progress: 0, error: "Upload didn’t finish." };
    const { onPosted } = show();
    pick(jpg("a.jpg"));
    fireEvent.click(post());
    await waitFor(() => expect(mocks.postMedia).toHaveBeenCalled());
    expect(onPosted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Upload didn’t finish.");
    expect(screen.getByText("1 photo selected")).toBeInTheDocument();
  });

  it("shows progress and locks the form while uploading", () => {
    mocks.state = { status: "uploading", progress: 0.4, error: null };
    show();
    pick(jpg("a.jpg"));
    expect(screen.getByRole("status")).toHaveTextContent("40%");
    expect(screen.queryByRole("button", { name: /^post/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove photo 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("clears everything and releases previews when closed", () => {
    const { onClose } = show();
    pick(jpg("a.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:0");
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});
