# Photo strip: Share button (2026-11-05)

Status: **built** on `claude/modest-cori-2wwy2a`. Decision recorded in ADR 004 point 7.

## What the owner sees

- In the viewer header, **Share** replaces Save (same pill, share icon). Only the strip's owner gets it.
- Tapping it opens the app's `BottomSheet` "Share photo strip":
  - **Share to WhatsApp, Facebook…**: `navigator.share({ files: [image] })`, no text. Shown only when
    `navigator.canShare({ files })` is true and the image has loaded.
  - **Save to phone**: downloads `photo-strip.jpg` (the prefetched file, or the owner route itself).
  - Hint: on iPhone, Share → Save Image puts it in Photos (a download on iOS lands in Files).

## Why this shape

- The share sheet lists every installed app that takes images. `wa.me` and the Facebook sharer only take a
  URL or text, so they could not carry the image.
- The image is prefetched from `GET /api/posts/{id}/strip` when the viewer opens, because iOS drops the tap's
  permission to share across a `fetch`. That route checks the device token, so a non-owner never gets a file.
- A second tap while the share sheet is up is ignored (iOS rejects it with `InvalidStateError`). A refused
  share falls back to the download. Closing the share sheet does nothing.

## Code

`src/components/viewer/StripShare.tsx` (was `StripSave.tsx`), `PostViewer.tsx`, tests in `PostViewer.test.tsx`.
No server, route or migration change.

## Needs a real phone

iPhone Safari + Android Chrome: WhatsApp (chat + status), Facebook (feed + story), Instagram Stories get the
full image uncropped; Save to phone on Android lands in the gallery / Downloads; on iOS the hint matches.
