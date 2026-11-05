# 004 — Photo strip

**Status:** accepted (2026-11-05). Plan: `docs/superpowers/plans/2026-11-05-photo-strip.md`.

## Decision
A photo strip is 3 photos placed in a 1080 × 1920 template (the Instagram story size).

1. **The phone makes the finished image** at post time (canvas, like photo resizing) and uploads it with
   the 3 photos. Media positions: 0 = the finished image, 1–3 = the photos. A posted strip never changes,
   so replacing the template only affects new strips.
2. **The phone may ask for one layout, `strip`.** The files of a strip and of a 4-photo album look alike,
   so the upload request carries `layout: "strip"`, stored on the upload intent. The server still derives
   the type: `strip` only when the intent says so **and** the files have the exact shape (4 JPEG mains, the
   first declared 1080 × 1920, each with a thumbnail); otherwise the request is refused. This amends the
   "never trust the client's type" rule in CLAUDE.md and ADR 003 for this one case.
3. **Photos sit on top of the template**, inside 3 admin-set windows (template pixels, `events.strip_windows`).
   A template needs no transparent holes. Decorations cannot overlap a photo.
4. **Default template:** `public/strip/default-template.png` (the design's art). On it the app draws the
   couple's names and the wedding date (`events.event_date`); a custom template is used as it is.
5. **The template is served from the app's origin** (`/strip/template?v=<key>`, or the static default), because
   a canvas can only export pixels it read from its own origin.
6. **Save is owner-only on the server** (`GET /api/posts/{id}/strip` checks the device token). The image is
   still shown to every guest in the viewer, so this is a convenience, not protection.
7. **Share replaces Save** (2026-11-05). The owner's Share button opens a sheet: "Share to WhatsApp,
   Facebook…" is the Web Share API with the image file (shown only when `navigator.canShare({ files })`),
   "Save to phone" downloads it. No `wa.me` / Facebook sharer links: they take a URL, not an image. No text
   is sent with the file.

## Why
No image library or CPU work on the VPS; the phone already resizes photos. A flattened image is what the
guest posts to Instagram, and it keeps old strips stable.

## Consequences
- `layout` is written with one update right after `create_upload_intent` (that function is shared by every
  upload). If the update fails, the intent has no URLs yet and only counts against the hour until the sweep.
- The server cannot verify that the finished image really contains the 3 photos; it is the guest's own upload,
  checked for size, type and magic bytes like any photo.
