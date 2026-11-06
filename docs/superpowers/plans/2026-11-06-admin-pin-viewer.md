# Admin: view a post and pin it (2026-11-06)

Status: **built** (design approved, 3 pins). Unit tests green; checked end to end in Android Chrome (Playwright) on 2026-11-06. Real phones still to do. Branch `feat/admin-pin-viewer` (from main `f09c54c`).
Design: canvas "Wedding Memories, Burgundy", row "Admin — view a post and pin it" (A1 list, A2 viewer, A3 wall).

Already done on this branch (uncommitted): a **Refresh** button on the admin post list, which reloads page 1
(`useAdminPosts.refresh()`, test in `admin.test.tsx`). The admin list does not follow Realtime, so this is how
the admin sees posts shared since `/admin` was opened.

## What the admin sees

- **Post list** (`ModerationList`): every thumbnail opens the post. Each row gets **Pin / Unpin** next to
  Hide and Delete, and a "Pinned" tag. The heading shows "2 of 3 pinned".
- **Admin viewer**: full screen, dark, opened over `/admin` (not `/p/[id]`).
  - Photo: fit to screen. Album: prev / next, "2 / 5" counter, thumbnails. Video: native player with poster.
    Wish: the full text. Caption below.
  - Bottom bar: **Pin to top of wall / Unpin**, **Hide / Unhide**, **Delete** (through the confirm dialog).
  - Closing returns to the list where the admin left it.
- **At most 3 pins** (`MAX_PINS` in `limits.ts`). A 4th: "You can pin 3 posts. Unpin one first."
- **Hiding a post unpins it**; a hidden post cannot be pinned (the Pin button is disabled with a hint).

## What guests see

- Pinned posts come **first** on the wall, newest pin first, under the matching filter (a pinned video
  shows under All and Videos).
- **No badge.** Guests just see the post at the top; only the admin sees "Pinned".
- A pinned post **also keeps its own place** further down the wall.
- Filter counts do not change: a pinned post is still one post.
- Phones update live: pinning updates the `posts` row, and every phone already refetches page 1 on any
  `posts` change (`src/lib/realtime.ts`).

## Why this shape

- **Viewer over `/admin`, not `/p/[id]`**: the guest viewer only loads visible posts (`getPost` filters
  `hidden = false`), and the admin must see hidden posts to decide on them. Reuses `AlbumGallery` and
  `VideoPlayer`.
- **Pinned posts stay in the timeline too**: taking them out of the paginated feed breaks the cursor. When a
  post is unpinned, a phone that has scrolled past its old spot would not get it back until a reload. Keeping
  it in both places needs no cursor change.
- **Pins come with page 1 only**, like the wishes ticker, so later pages are unchanged.
- **3 pins** keep the top of the wall from filling up with pinned posts.

## Changes

1. **Migration `0009_pinned_posts.sql`**: `posts.pinned_at timestamptz` (null = not pinned; also the pin
   order). Regenerate `database.types.ts`.
2. **Server**
   - `wall.ts`: `getPinnedPosts()` (visible, `pinned_at is not null`, newest pin first, `MAX_PINS`), returned
     by `GET /api/posts` on the first page only.
   - `admin.ts`: `setPinned(postId, pinned)` enforces the limit (`409 pin_limit`) and refuses hidden posts;
     `setHidden(…, true)` clears `pinned_at`. The moderation page returns `pinned` per post.
3. **API**: `PATCH /api/admin/posts/[id]` accepts `{ hidden }` or `{ pinned }` (zod in `validation.ts`).
   No new route.
4. **Wall**: `useWall` keeps a `pinned` list next to `wishes` (refreshed with page 1). `Wall.tsx` renders the
   pinned cards that match the filter before the rest. `PostCard` unchanged.
5. **Admin**: `useAdminPosts` gets `setPinned`; `ModerationList` gets the Pin button, the tag, the
   "n of 3 pinned" line, and a thumbnail button that opens the new `AdminViewer` (one file in
   `components/admin/`).
6. **Docs**: `CLAUDE.md` (data model: `pinned_at`; screens: wall order, admin viewer + pin), `docs/PLAN.md`
   progress.

## Tests

- `setPinned`: pins, unpins, limit of 3, hidden post refused, other event's post is `404`.
- `setHidden` clears the pin.
- PATCH body: `{ pinned }` and `{ hidden }` accepted, both or neither rejected.
- `GET /api/posts`: page 1 carries the pins, later pages don't; hidden pinned posts never appear.
- Wall: pinned cards first, filtered with the rest.
- Admin: Pin button, limit message, viewer opens from the thumbnail, Pin / Hide / Delete inside it.

## Open questions

- Approve the design (A1–A3) before code.
- Limit of 3 pins, or 1?

## Needs a real phone

iPhone Safari + Android Chrome: the admin viewer (album swipe, video playback, safe areas); a pin shows at the
top of an open wall within a few seconds; unpinning returns the wall to plain newest-first.
