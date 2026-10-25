import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallPost } from "../../../tests/fixtures/posts";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

import { useMyPosts } from "./useMyPosts";

const a = wallPost({ id: "00000000-0000-4000-8000-00000000000a" });
const b = wallPost({ id: "00000000-0000-4000-8000-00000000000b" });
const ok = (data: unknown) => ({ ok: true, data });
const fail = { ok: false, error: { code: "network", message: "Can’t reach the server." } };

beforeEach(() => mocks.api.mockReset());

describe("useMyPosts", () => {
  it("asks for nothing while the drawer is closed", () => {
    const { result } = renderHook(() => useMyPosts(false));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ posts: [], status: "loading" });
  });

  it("loads the guest's posts when the drawer opens, and again on every open", async () => {
    mocks.api.mockResolvedValue(ok([a, b]));
    const { result, rerender } = renderHook(({ open }) => useMyPosts(open), { initialProps: { open: true } });
    await act(async () => {});
    expect(mocks.api).toHaveBeenCalledWith("/api/me/posts", "GET");
    expect(result.current).toMatchObject({ posts: [a, b], status: "ready" });

    rerender({ open: false });
    mocks.api.mockResolvedValue(ok([a]));
    rerender({ open: true });
    await act(async () => {});
    expect(result.current.posts).toEqual([a]);
  });

  it("reports a failure and retries on request", async () => {
    mocks.api.mockResolvedValueOnce(fail);
    const { result } = renderHook(() => useMyPosts(true));
    await act(async () => {});
    expect(result.current.status).toBe("error");

    mocks.api.mockResolvedValueOnce(ok([a]));
    await act(async () => result.current.retry());
    expect(result.current).toMatchObject({ posts: [a], status: "ready" });
  });

  it("drops a deleted post from the list without asking again", async () => {
    mocks.api.mockResolvedValue(ok([a, b]));
    const { result } = renderHook(() => useMyPosts(true));
    await act(async () => {});
    act(() => result.current.drop(a.id));
    expect(result.current.posts).toEqual([b]);
    expect(mocks.api).toHaveBeenCalledOnce();
  });

  it("ignores a slow answer to an earlier request", async () => {
    let slow!: (r: unknown) => void;
    mocks.api.mockReturnValueOnce(new Promise((resolve) => (slow = resolve)));
    const { result } = renderHook(() => useMyPosts(true));
    mocks.api.mockResolvedValueOnce(ok([b]));
    await act(async () => result.current.retry());
    expect(result.current.posts).toEqual([b]);
    await act(async () => slow(ok([a])));
    expect(result.current.posts).toEqual([b]);
  });
});
