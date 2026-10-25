import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postMedia: vi.fn(),
  reset: vi.fn(),
  prepareVideo: vi.fn(),
  state: { status: "idle", progress: 0, error: null as string | null },
}));
vi.mock("./useCreatePost", () => ({
  useCreatePost: () => ({ ...mocks.state, postMedia: mocks.postMedia, reset: mocks.reset }),
}));
vi.mock("@/lib/media", () => ({
  prepareVideo: mocks.prepareVideo,
  MediaError: class MediaError extends Error {},
}));

import { MediaError } from "@/lib/media";
import { VideoDrawer } from "./VideoDrawer";

const clip = (name = "dance.mp4", type = "video/mp4", size = 12 * 1024 * 1024) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};
const show = () => {
  const props = { open: true, onClose: vi.fn(), onPosted: vi.fn() };
  render(<VideoDrawer {...props} />);
  return props;
};
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = async (file: File) => fireEvent.change(input(), { target: { files: [file] } });
const post = () => screen.getByRole("button", { name: "Post video" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { status: "idle", progress: 0, error: null };
  mocks.postMedia.mockResolvedValue(true);
  mocks.prepareVideo.mockImplementation(async (file: File) => ({
    file,
    poster: new Blob(["p"], { type: "image/jpeg" }),
    width: 1280,
    height: 720,
    durationS: 24,
  }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:poster"), revokeObjectURL: vi.fn() }));
});

describe("VideoDrawer", () => {
  it("starts with a chooser and Post disabled", () => {
    show();
    expect(screen.getByText("Choose a video")).toBeInTheDocument();
    expect(post()).toBeDisabled();
  });

  it("shows the chosen video's name and size", async () => {
    show();
    await pick(clip("first-dance.mp4"));
    expect(await screen.findByText("first-dance.mp4")).toBeInTheDocument();
    expect(screen.getByText("12.0 MB")).toBeInTheDocument();
    expect(post()).toBeEnabled();
    expect(screen.queryByText("Choose a video")).not.toBeInTheDocument();
  });

  it("shows small files in KB", async () => {
    show();
    await pick(clip("tiny.mp4", "video/mp4", 26_483));
    expect(await screen.findByText("26 KB")).toBeInTheDocument();
  });

  it("explains a video that is too big or too long", async () => {
    mocks.prepareVideo.mockRejectedValue(new MediaError("That video is 110.0 MB. Please choose one under 100 MB (about 60 seconds)."));
    show();
    await pick(clip("big.mp4", "video/mp4", 110 * 1024 * 1024));
    expect(await screen.findByRole("alert")).toHaveTextContent("110.0 MB");
    expect(post()).toBeDisabled();
    expect(screen.getByText("Choose a video")).toBeInTheDocument();
  });

  it("refuses a file type the server would not accept, without reading it", async () => {
    show();
    await pick(clip("clip.avi", "video/x-msvideo"));
    expect(await screen.findByRole("alert")).toHaveTextContent("MP4 or MOV");
    expect(mocks.prepareVideo).not.toHaveBeenCalled();
  });

  it("removes the video and releases the poster preview", async () => {
    show();
    await pick(clip());
    fireEvent.click(await screen.findByRole("button", { name: "Remove video" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:poster");
    expect(screen.getByText("Choose a video")).toBeInTheDocument();
  });

  it("posts the video with its poster and duration, then reports it", async () => {
    const { onPosted } = show();
    await pick(clip());
    await screen.findByText("dance.mp4");
    fireEvent.change(screen.getByLabelText(/caption/i), { target: { value: "First dance" } });
    fireEvent.click(post());

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith("video"));
    const [items, caption] = mocks.postMedia.mock.calls[0]!;
    expect(caption).toBe("First dance");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ role: "main", position: 0, mime: "video/mp4", width: 1280, height: 720, durationS: 24 });
    expect(items[1]).toMatchObject({ role: "poster", position: 0, mime: "image/jpeg" });
  });

  it("posts without a poster when none could be captured", async () => {
    mocks.prepareVideo.mockImplementation(async (file: File) => ({ file, poster: null, width: 1, height: 1, durationS: 5 }));
    show();
    await pick(clip());
    await screen.findByText("dance.mp4");
    fireEvent.click(post());
    await waitFor(() => expect(mocks.postMedia).toHaveBeenCalled());
    expect(mocks.postMedia.mock.calls[0]![0]).toHaveLength(1);
  });

  it("keeps the video and shows the error when posting fails", async () => {
    mocks.postMedia.mockResolvedValue(false);
    mocks.state = { status: "idle", progress: 0, error: "Upload didn’t finish." };
    const { onPosted } = show();
    await pick(clip());
    await screen.findByText("dance.mp4");
    fireEvent.click(post());
    await waitFor(() => expect(mocks.postMedia).toHaveBeenCalled());
    expect(onPosted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Upload didn’t finish.");
    expect(screen.getByText("dance.mp4")).toBeInTheDocument();
  });

  it("shows progress and locks the sheet while uploading", () => {
    mocks.state = { status: "uploading", progress: 0.25, error: null };
    show();
    expect(screen.getByRole("status")).toHaveTextContent("25%");
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("clears the video when closed", async () => {
    const { onClose } = show();
    await pick(clip());
    await screen.findByText("dance.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
    expect(screen.queryByText("dance.mp4")).not.toBeInTheDocument();
  });
});
