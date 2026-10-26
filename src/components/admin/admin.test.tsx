import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEvent, AdminPost } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  putFile: vi.fn(),
  zip: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/upload", () => ({ putFile: mocks.putFile }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("client-zip", () => ({
  downloadZip: (files: AsyncIterable<unknown>) => ({
    blob: async () => {
      for await (const f of files) mocks.zip(f);
      return new Blob(["zip"]);
    },
  }),
}));

import { AdminDashboard } from "./AdminDashboard";
import { AdminLogin } from "./AdminLogin";
import { useAdminPosts } from "./useAdminPosts";
import { useDownloadAll } from "./useDownloadAll";
import { useQrUpload } from "./useQrUpload";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (code: string, message = code) => ({ ok: false as const, error: { code, message } });

const EVENT: AdminEvent = {
  groomName: "Groom",
  brideName: "Bride",
  headerMessage: "Hi",
  uploadsOpen: true,
  qrAccountName: "",
  qrBank: "",
  hasQr: false,
};
const post = (id: string, over: Partial<AdminPost> = {}): AdminPost => ({
  id,
  type: "wish",
  caption: null,
  wishText: "Congrats",
  createdAt: "2026-10-25T10:00:00Z",
  guestId: "g1",
  author: "Ali",
  media: [],
  hidden: false,
  ...over,
});
const NOW = "2026-10-25T10:05:00Z";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.api.mockResolvedValue(ok(null));
});

describe("AdminLogin", () => {
  it("sends the passcode and refreshes the page on success", async () => {
    render(<AdminLogin />);
    expect(screen.getByRole("button", { name: "Enter" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "letmein" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/session", "POST", { passcode: "letmein" });
  });

  it("shows why a passcode was refused and lets the admin try again", async () => {
    mocks.api.mockResolvedValue(fail("wrong_passcode", "That passcode isn’t right."));
    render(<AdminLogin />);
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That passcode isn’t right.");
    expect(screen.getByRole("button", { name: "Enter" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("AdminDashboard", () => {
  const show = (posts: AdminPost[] = [], nextCursor: string | null = null) =>
    render(<AdminDashboard event={EVENT} initialPosts={{ posts, nextCursor }} now={NOW} />);

  it("saves the couple's details", async () => {
    mocks.api.mockResolvedValue(ok({ ...EVENT, groomName: "Ali" }));
    show();
    const save = screen.getAllByRole("button", { name: "Save" })[0]!;
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Groom"), { target: { value: "Ali" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/api/admin/event", "PATCH", {
        groomName: "Ali",
        brideName: "Bride",
        headerMessage: "Hi",
      }),
    );
    expect(await screen.findByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("shows a save error", async () => {
    mocks.api.mockResolvedValue(fail("invalid_input", "Nothing to change."));
    show();
    fireEvent.change(screen.getByLabelText("Bride"), { target: { value: "Aina" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Nothing to change.");
  });

  it("closes uploads from the switch", async () => {
    mocks.api.mockResolvedValue(ok({ ...EVENT, uploadsOpen: false }));
    show();
    fireEvent.click(screen.getByRole("switch", { name: "Guests can upload" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/admin/event", "PATCH", { uploadsOpen: false }));
    expect(await screen.findByText(/Uploads are/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("saves the QR holder and bank", async () => {
    mocks.api.mockResolvedValue(ok({ ...EVENT, qrAccountName: "Nazrul", qrBank: "Maybank" }));
    show();
    fireEvent.change(screen.getByLabelText("Account holder name"), { target: { value: "Nazrul" } });
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "Maybank" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1]!);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/api/admin/event", "PATCH", { qrAccountName: "Nazrul", qrBank: "Maybank" }),
    );
  });

  it("uploads a QR image and shows it", async () => {
    mocks.api
      .mockResolvedValueOnce(ok({ key: "k", url: "https://r2.test/k" }))
      .mockResolvedValueOnce(ok({ ...EVENT, hasQr: true }));
    mocks.putFile.mockResolvedValue(undefined);
    show();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "qr.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByAltText("Current DuitNow QR")).toHaveAttribute("src", "/qr?v=1");
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/qr", "POST", { mime: "image/png", bytes: 1 });
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/qr", "PUT", { key: "k" });
    expect(screen.getByText("Replace QR")).toBeInTheDocument();
  });

  it("refuses a QR of the wrong type before uploading", async () => {
    show();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "qr.gif", { type: "image/gif" })] } });
    expect(await screen.findByText(/PNG or JPEG/, { selector: "p[role=alert]" })).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("hides, unhides and deletes a post, with a confirmation for the delete", async () => {
    show([post("p1"), post("p2", { hidden: true, wishText: null, caption: "Cake", type: "photo" })]);
    expect(screen.getByText("Hidden")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/admin/posts/p1", "PATCH", { hidden: true }));
    expect((await screen.findAllByText("Hidden")).length).toBe(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Unhide" })[0]!);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/admin/posts/p1", "PATCH", { hidden: false }));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(mocks.api).not.toHaveBeenCalledWith("/api/admin/posts/p1", "DELETE");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/admin/posts/p1", "DELETE"));
    await waitFor(() => expect(screen.queryByText(/Wish · Ali/)).not.toBeInTheDocument());
  });

  it("logs out and refreshes", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/session", "DELETE");
  });

  it("says when nothing has been shared", () => {
    show();
    expect(screen.getByText("Nothing has been shared yet.")).toBeInTheDocument();
  });
});

describe("useAdminPosts", () => {
  it("loads the next page without repeating a post", async () => {
    mocks.api.mockResolvedValue(ok({ posts: [post("p1"), post("p2")], nextCursor: null }));
    const { result } = renderHook(() => useAdminPosts({ posts: [post("p1")], nextCursor: "c1" }));
    expect(result.current.hasMore).toBe(true);
    await act(() => result.current.loadMore());
    expect(mocks.api).toHaveBeenCalledWith("/api/admin/posts?cursor=c1", "GET");
    expect(result.current.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps the list and reports a failed page", async () => {
    mocks.api.mockResolvedValue(fail("internal", "Something went wrong."));
    const { result } = renderHook(() => useAdminPosts({ posts: [post("p1")], nextCursor: "c1" }));
    await act(() => result.current.loadMore());
    expect(result.current.error).toBe("Something went wrong.");
    expect(result.current.posts).toHaveLength(1);
  });

  it("does nothing without a next page, and returns the server's message for a failed hide or delete", async () => {
    const { result } = renderHook(() => useAdminPosts({ posts: [post("p1")], nextCursor: null }));
    await act(() => result.current.loadMore());
    expect(mocks.api).not.toHaveBeenCalled();

    mocks.api.mockResolvedValue(fail("internal", "Nope."));
    await expect(result.current.setHidden(post("p1"), true)).resolves.toBe("Nope.");
    await expect(result.current.remove(post("p1"))).resolves.toBe("Nope.");
    expect(result.current.posts).toHaveLength(1);

    mocks.api.mockResolvedValue(fail("post_not_found"));
    await act(async () => void (await result.current.remove(post("p1"))));
    expect(result.current.posts).toHaveLength(0);
  });
});

describe("useQrUpload", () => {
  const file = new File(["x"], "qr.png", { type: "image/png" });

  it("reports a failed presign, a failed upload and a failed confirm", async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useQrUpload(onDone));

    mocks.api.mockResolvedValueOnce(fail("invalid_input", "Too big."));
    await act(() => result.current.upload(file));
    expect(result.current.error).toBe("Too big.");

    mocks.api.mockResolvedValueOnce(ok({ key: "k", url: "u" }));
    mocks.putFile.mockRejectedValueOnce(new Error("Upload failed (403)"));
    await act(() => result.current.upload(file));
    expect(result.current.error).toBe("Upload failed (403)");

    mocks.api.mockResolvedValueOnce(ok({ key: "k", url: "u" })).mockResolvedValueOnce(fail("upload_incomplete", "Try again."));
    mocks.putFile.mockResolvedValueOnce(undefined);
    await act(() => result.current.upload(file));
    expect(result.current.error).toBe("Try again.");
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.progress).toBeNull();
  });
});

describe("useDownloadAll", () => {
  const entries = [
    { url: "https://m/a.jpg", name: "Ali/a.jpg" },
    { url: "https://m/b.mp4", name: "Ali/b.mp4" },
  ];

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:zip");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("fetches each file in turn, zips them and saves the zip", async () => {
    mocks.api.mockResolvedValue(ok(entries));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes")));
    const { result } = renderHook(() => useDownloadAll());
    await act(() => result.current.download());
    expect(mocks.zip).toHaveBeenCalledTimes(2);
    expect(mocks.zip.mock.calls[0]![0]).toMatchObject({ name: "Ali/a.jpg" });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toBeNull();
    vi.unstubAllGlobals();
  });

  it("says so when there is nothing to download, or the list cannot be loaded", async () => {
    const { result } = renderHook(() => useDownloadAll());
    mocks.api.mockResolvedValueOnce(ok([]));
    await act(() => result.current.download());
    expect(result.current.error).toMatch(/no photos or videos/);
    mocks.api.mockResolvedValueOnce(fail("not_admin", "Please enter the admin passcode."));
    await act(() => result.current.download());
    expect(result.current.error).toBe("Please enter the admin passcode.");
  });

  it("skips files that are gone from storage, zips the rest and says how many were missing", async () => {
    mocks.api.mockResolvedValue(ok(entries));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("a.jpg") ? new Response("", { status: 404 }) : new Response("bytes"))),
    );
    const { result } = renderHook(() => useDownloadAll());
    await act(() => result.current.download());
    expect(mocks.zip).toHaveBeenCalledTimes(1);
    expect(mocks.zip.mock.calls[0]![0]).toMatchObject({ name: "Ali/b.mp4" });
    expect(result.current.notice).toBe("Saved. 1 of 2 files were missing in storage and are not in the zip.");
    expect(result.current.error).toBeNull();
    vi.unstubAllGlobals();
  });

  it("stops with a message when a file cannot be fetched", async () => {
    mocks.api.mockResolvedValue(ok(entries));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { result } = renderHook(() => useDownloadAll());
    await act(() => result.current.download());
    expect(result.current.error).toMatch(/Couldn’t fetch Ali\/a\.jpg \(500\)/);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
