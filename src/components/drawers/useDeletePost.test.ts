import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallPost, wishPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

import { useDeletePost } from "./useDeletePost";

const album = wallPost({ type: "album" });
const fail = (code: string, message = "Nope.") => ({ ok: false, error: { code, message } });

beforeEach(() => mocks.api.mockReset());

describe("useDeletePost", () => {
  it("asks first: nothing is sent until the guest confirms", () => {
    const { result } = renderHook(() => useDeletePost(vi.fn()));
    expect(result.current.dialog.open).toBe(false);
    act(() => result.current.ask(album));
    expect(result.current.dialog).toMatchObject({ open: true, title: "Delete this album?", confirmLabel: "Delete", cancelLabel: "Keep it" });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("names the kind of post in the question", () => {
    const { result } = renderHook(() => useDeletePost(vi.fn()));
    act(() => result.current.ask(wishPost()));
    expect(result.current.dialog.title).toBe("Delete this wish?");
  });

  it("deletes, closes and reports the post", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: null });
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeletePost(onDeleted));
    act(() => result.current.ask(album));
    await act(() => result.current.dialog.onConfirm());
    expect(mocks.api).toHaveBeenCalledWith(`/api/posts/${album.id}`, "DELETE");
    expect(onDeleted).toHaveBeenCalledWith(album);
    expect(result.current.dialog).toMatchObject({ open: false, pending: false, error: null });
  });

  it("cancelling closes it without a request", () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeletePost(onDeleted));
    act(() => result.current.ask(album));
    act(() => result.current.dialog.onCancel());
    expect(result.current.dialog.open).toBe(false);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("treats a post that is already gone as deleted", async () => {
    mocks.api.mockResolvedValue(fail("post_not_found"));
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeletePost(onDeleted));
    act(() => result.current.ask(album));
    await act(() => result.current.dialog.onConfirm());
    expect(onDeleted).toHaveBeenCalledWith(album);
  });

  it("keeps the dialog open with the reason when the request fails, and can retry", async () => {
    mocks.api.mockResolvedValueOnce(fail("network", "Can’t reach the server."));
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeletePost(onDeleted));
    act(() => result.current.ask(album));
    await act(() => result.current.dialog.onConfirm());
    expect(result.current.dialog).toMatchObject({ open: true, pending: false, error: "Can’t reach the server." });
    expect(onDeleted).not.toHaveBeenCalled();

    mocks.api.mockResolvedValueOnce({ ok: true, data: null });
    await act(() => result.current.dialog.onConfirm());
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("ignores a second tap while the first request runs", async () => {
    let finish!: (r: unknown) => void;
    mocks.api.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useDeletePost(vi.fn()));
    act(() => result.current.ask(album));
    let first!: Promise<void>;
    act(() => void (first = result.current.dialog.onConfirm()));
    expect(result.current.dialog.pending).toBe(true);
    await act(() => result.current.dialog.onConfirm());
    expect(mocks.api).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ ok: true, data: null });
      await first;
    });
  });

  it("does nothing when confirmed before anything was asked", async () => {
    const { result } = renderHook(() => useDeletePost(vi.fn()));
    await act(() => result.current.dialog.onConfirm());
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
