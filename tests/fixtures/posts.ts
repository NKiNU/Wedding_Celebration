import type { WallMedia, WallPost } from "@/lib/domain/posts";

export const image = (n = 0): WallMedia => ({
  kind: "image",
  url: `https://media.example.com/${n}.jpg`,
  thumbUrl: `https://media.example.com/${n}_thumb.jpg`,
  posterUrl: null,
  durationS: null,
});

export const wallPost = (over: Partial<WallPost> = {}): WallPost => ({
  id: "b0000000-0000-4000-8000-000000000001",
  type: "photo",
  caption: null,
  wishText: null,
  createdAt: "2026-10-25T11:55:00.000000+00:00",
  guestId: "a0000000-0000-4000-8000-000000000001",
  author: "Nazrul",
  media: [image()],
  ...over,
});

export const wishPost = (over: Partial<WallPost> = {}) =>
  wallPost({ type: "wish", wishText: "Selamat pengantin baru!", media: [], author: "Siti", ...over });
