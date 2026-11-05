# Photo strip: Share button (plan, 2026-11-05)

Status: **planned, not built.** Branch `claude/modest-cori-2wwy2a` (from `main` at 335efd0).

## Goal

In the post viewer, next to **Save**, the owner of a photo strip gets a **Share** button that opens the
phone's share sheet with the finished 1080 × 1920 image, so they can send it to WhatsApp, Facebook,
Instagram, Telegram, etc. Only the strip's owner sees it, same as Save.

## How it works

- **Web Share API with a file**: `navigator.share({ files: [stripFile] })`. On iOS Safari and Android
  Chrome the sheet lists every installed app that takes images (WhatsApp, Facebook, Instagram Stories,
  Messenger, Telegram, …). We do not link to `wa.me` or `facebook.com/sharer`: those only take a URL or text,
  not an image, and would have to share the `/p/{id}` link instead (a public page; Facebook would also need
  Open Graph tags). The image is what the guest wants to post.
- **Same file as Save.** The image comes from the existing owner-only route `GET /api/posts/{id}/strip`
  (device-token check, 404/403 for anyone else). No server change, no new route, no migration.
- **Prefetch once, used by both buttons.** iOS drops the tap's share permission across a `fetch`, so the
  file must be in memory before the tap. Move the prefetch out of `StripSave` into a hook
  `useStripFile(postId)` (returns `File | null`); `PostViewer` calls it once when `mine && strip` and passes
  the file to both buttons.
- **Shown only when it can work.** Render Share only when the file has loaded **and**
  `navigator.canShare?.({ files: [file] })` is true. Desktop browsers and old phones without file sharing
  just keep Save (which downloads). No disabled-looking button, no dead end.

## Owner-only (rule)

1. UI: Share renders only under `mine && strip`, like Save (ownership = active device token, never name).
2. Server: the file only exists on the client if `/api/posts/{id}/strip` returned it, and that route already
   rejects anyone who is not the owner. A non-owner who forces the button into the DOM gets no file, so
   `canShare` is never true and nothing is shared.
3. As ADR 004 says, the strip is still visible to every guest in the viewer (long-press works), so this is a
   convenience, not protection. Nothing changes there.

## Save vs Share

Today Save already uses the share sheet when the phone can share files (on iOS that is the only way to
reach "Save Image" → Photos). Keep Save exactly as it is so guests who look for "Save" still find Photos.
Share is the same sheet under the label guests look for when they want WhatsApp/Facebook. On Android the
two differ more: Save could become a plain download there later, but that is out of scope.

## UI

Header today: back · author/time · **Save** (pill with label) · delete (44 px round). Add **Share** as a
44 × 44 round icon button (share/arrow-out-of-box icon, `aria-label="Share photo strip"`) between Save and
delete, styled like the delete button (`ROUND` + `bg-overlay-ink/12`), so the row still fits at 320 px.
Token-driven only, no hex/font in the component. Under the image, change the hint to
"Share sends it to WhatsApp, Facebook and more. Or long-press the image and tap Save to Photos." when Share
is shown; keep today's hint otherwise.

## Behaviour details

- `share({ files: [file], title: "Photo strip" })`. No `text`: several targets (Instagram, some WhatsApp
  versions) drop or mis-handle text sent with a file, and the couple's names are already in the image.
- `AbortError` (guest closed the sheet): do nothing.
- `NotAllowedError` or any other error: toast "Couldn't open sharing. Use Save, then share from your
  gallery."
- Guard double taps: ignore a tap while a share is in progress (iOS throws `InvalidStateError` if
  `share()` is called again before the first one settles).

## Files

- `src/components/viewer/useStripFile.ts` (new): the prefetch from `StripSave`, with the stale guard.
- `src/components/viewer/StripSave.tsx`: take `file` + `postId` as props instead of fetching.
- `src/components/viewer/StripShare.tsx` (new): the button + canShare check + error toast.
- `src/components/viewer/PostViewer.tsx`: call the hook, render `StripShare`, hint text.
- `docs/adr/004-photo-strip.md`: add point 7 (Share = Web Share with the owner's file, no social links).
- `docs/PLAN.md`: progress line; add "share sheet to WhatsApp/Facebook on a real iPhone + Android" to the
  real-phone checklist.

## Tests (vitest, keep ≥ 80 %)

- `useStripFile`: fetches once, ignores a late response after unmount, returns null on `!ok` / network error.
- `StripShare`: not rendered when `canShare` is missing or false, or the file is null; calls
  `navigator.share` with the jpeg named `photo-strip.jpg`; AbortError is silent; other errors show the toast;
  second tap while pending does not call `share` again.
- `PostViewer`: Share shown for the owner's strip; not for someone else's strip; not for the owner's photo,
  album or video; the strip route is fetched once even with both buttons.
- Existing `StripSave` tests updated to pass the file in.
- e2e (Playwright, both profiles): stub `navigator.canShare`/`share`, check the button appears for the owner
  only and is called with one file.

## Needs a real phone

iPhone Safari and Android Chrome: WhatsApp (chat + status), Facebook (feed + story), Instagram Stories
receive the full 1080 × 1920 image uncropped; closing the sheet shows no error.

## Open questions for you

1. Share icon-only (as planned) or a labelled pill like Save? Labelled is clearer but the header gets tight
   on small phones.
2. Should Share also add a line of text (e.g. a wedding hashtag) where the target accepts it? Planned: no.
