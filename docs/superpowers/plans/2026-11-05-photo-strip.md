# Plan: photo strip (3 photos in a story-size template)

Status: **built (2026-11-05)** on `ccr-678fc320-9kuhn0`; not yet run against a database or on a phone. The owner agreed to the post-type rule change
(ADR 004) and asked for the wedding date (07 Nov 2026) on the default template: `events.event_date`,
set by migration 0008 and editable in admin. Deviation: `layout` is saved with one update after
`create_upload_intent` instead of a new argument (that function is shared by every upload).

## Context

- Design: canvas "Wedding Memories, Burgundy", row "Photo strip — upload into the wedding template",
  https://claude.ai/artifact/Gfm7hciUDNNGnWdRKDYpJK (P1–P9, plus the live "Strip page" and the
  "Template placeholder art" component). **The design's template is the default template**; the admin can
  replace it later by uploading their own.
- What the guest gets: a second way to post photos. "Make a photo strip" opens a full-screen page showing the
  template (1080 × 1920, the Instagram story size) with 3 empty photo windows. Tap a window → photo picker →
  the photo fills it. Pinch to zoom, drag to move; the window never changes size and the photo always covers
  it. Hold a photo → a bin appears → drag onto the bin to remove it. Post when all 3 are filled.
- On the wall: a stacked card (like an album) with a **Strip** badge. Opening it shows the finished image.
- Only the guest who made it gets **Save** (the plain 1080 × 1920 image, ready for an Instagram story).
- Admin: upload a template (PNG/JPG, 1080 × 1920) and place/resize the 3 windows on it.

## Decisions (agreed or chosen as the default; say if any should change)

1. **The finished image is made on the guest's phone** (canvas, like today's photo resizing), at post time,
   and uploaded with the post. So a strip never changes later: **strips already posted keep the template they
   were made with**, even after the admin uploads a new one. No image library on the server.
2. **Photos sit on top of the template**, inside the windows. A template needs no transparent holes; the
   designer draws empty boxes and the admin drags the windows onto them. (Decorations cannot overlap a photo.)
3. **Strips count under the Photos filter pill**, like albums.
4. **Windows:** 3, admin-set, in template pixels. Default `x 290, w 500, h 375, y 250 / 665 / 1080`
   (the design's spots). "Same size for all three" is on by default in the admin editor.
5. **Default template = the design's artwork** (burgundy, halftone dots, line-art florals, silver card).
   The couple's names and "The wedding of" are **drawn by the app** on the default template (from the event,
   in the chosen names font), so it is right for every couple. A custom template is used as is: its own art
   carries any names. The default has **no date** (events have no date field; see "Open questions").
6. **Save is enforced on the server**: `GET /api/posts/{id}/strip` returns the image as a download only to the
   guest whose device token owns the post. Honest limit: the finished image is still *shown* to every guest
   in the viewer, so anyone could screenshot it. Save is a convenience for the owner, not protection.
7. **Accessibility:** hold-and-drag is the touch way to remove a photo; a focused photo also removes with
   Delete/Backspace, and each filled window has a visually hidden "Remove photo N" button for screen readers.
   The admin window editor moves with arrow keys and has number fields.

### Needs your OK (CLAUDE.md change)

CLAUDE.md's "Do not" list says the client never chooses `post.type`, and the type is derived from the files
(1 image → photo, 2–10 → album, 1 video → video). A strip needs the phone to say "this is a strip", because
the server cannot tell a strip's files from an album's. The plan keeps the spirit of the rule:

- The upload request carries `layout: "strip"`; the server stores it on the upload intent.
- The server still **derives** the type: it is `strip` only if the intent says so **and** the files have the
  exact strip shape (1 composite 1080 × 1920 JPEG + 3 photos, each with a thumbnail). Anything else is rejected.
- CLAUDE.md, the data model section and `docs/adr/003-upload-intents.md` get this wording.

I won't start step 2 until you agree.

## Data model (migration `0008_photo_strip.sql`)

```sql
alter type public.post_type add value 'strip';

alter table public.events
  add column strip_template_path text,   -- R2 key of the admin's template; null = built-in default
  add column strip_windows jsonb;        -- [{x,y,w,h} x3] in template px; null = default windows

alter table public.upload_intents
  add column layout text check (layout in ('strip'));   -- null = regular upload
```

- `create_post_from_intent` / `create_upload_intent`: accept and keep `layout`; `wall_counts` counts `strip`
  under photos. `post_media` is unchanged. A strip's rows:
  - position 0: the composite (`kind image`, 1080 × 1920, `thumb_path` = 600 px wide thumbnail),
  - positions 1–3: the 3 photos as uploaded (resized to the usual 2048 px long edge, uncropped) with thumbnails.
  Keeping the 3 photos means the wall's stacked card has them, and "download all media" in admin includes them.
- `npx supabase gen types typescript --local > src/lib/database.types.ts` after the migration.
- RLS: no new tables; the new event columns are readable by anon like the rest of `events`.

## Files

| Area | File | What |
|---|---|---|
| Domain | `src/lib/domain/strip.ts` (+ test) | `TEMPLATE_W/H` (1080 × 1920), `DEFAULT_WINDOWS`, `windowsProblem(rects)` (3 rects, inside the template, min 160 × 120, no overlap), cover-fit math: `coverScale`, `clampPan`, `cropRect(photo, window, pan, zoom)` (source rectangle to draw) |
| Domain | `src/lib/domain/uploads.ts` | `stripShapeProblem(files)`; `derivePostType(files, layout)` returns `strip` only for the exact shape; `imageSizeOf(bytes)` (PNG IHDR / JPEG SOF) to check template dimensions |
| Domain | `src/lib/domain/posts.ts` | `PostType` + `"strip"`, `FILTER_OF.strip = "photos"`, `postLabel` "Photo strip", `coverOf` for strips (composite thumb), `stripPhotos(post)` |
| Limits | `src/lib/domain/limits.ts` | `MAX_STRIP_TEMPLATE_BYTES = 3 MB`, `STRIP_MIMES`, `STRIP_JPEG_QUALITY = 0.9`, `HOLD_MS = 450` |
| Validation | `src/lib/validation.ts` | upload body gets optional `layout: "strip"`; admin `stripWindows` schema (uses `windowsProblem`) |
| Client | `src/lib/strip.ts` (+ test) | `composeStrip({template, windows, photos, names?})` → 1080 × 1920 JPEG Blob + 600 px thumb, drawn on a canvas (template, then each photo cropped by `cropRect`, then, on the default template only, the names) |
| Asset | `public/strip/default-template.png` | the design's art at 1080 × 1920 **without** names; made once by `scripts/render-default-strip.mjs` (Playwright renders the design's markup) and committed |
| Server | `src/server/strip.ts` (+ test) | `getStripTemplate()` (custom from R2, or the default), presign/confirm/remove a template (like the monogram: key check, size, `looksLike`, dimensions exactly 1080 × 1920), `saveStripWindows()` |
| Server | `src/server/uploads.ts`, `posts.ts` | pass `layout` into the intent; `createMediaPost` uses `derivePostType(media, intent.layout)` |
| Routes | `src/app/strip/template/route.ts` | `GET`: the current template on the app's own origin (canvas needs same-origin pixels; same pattern as `/qr`), `?v=` cache-busted, long cache |
| Routes | `src/app/api/posts/[id]/strip/route.ts` | `GET`: owner only (token check, like delete), streams the composite with `Content-Disposition: attachment; filename="photo-strip.jpg"` |
| Routes | `src/app/api/admin/strip-template/route.ts` | `POST` presign, `PUT` confirm, `DELETE` back to default (admin cookie, `handle()` origin check) |
| Routes | `src/app/api/admin/event/route.ts` | accepts `stripWindows` |
| Page | `src/app/strip/page.tsx` | the full-screen editor page; no session → redirect to `/` with `next=/strip`; uploads closed → back to the wall with the usual message |
| UI | `src/components/strip/StripEditor.tsx` | top bar (back, "n of 3 photos"), the template at full width, the 3 windows, caption + Post bar; leaving with photos asks "Discard this strip?" (`ConfirmDialog`) |
| UI | `src/components/strip/StripWindow.tsx` | one window: empty = `<label>` with a file input; filled = photo with pan/zoom, the hint "Pinch to zoom · hold to remove" once, hidden Remove button |
| UI | `src/components/strip/useWindowGestures.ts` (+ test) | pointer events: 1 finger pans, 2 fingers pinch, hold 450 ms without moving lifts the photo; `touch-action: none`, no iOS callout |
| UI | `src/components/strip/Bin.tsx` | appears while a photo is held; "Drag here to remove" / "Release to remove" |
| UI | `src/components/strip/usePostStrip.ts` | prepare the 3 photos (`preparePhoto`), compose, `/api/uploads` with `layout`, PUT with progress, `/api/posts`; cancel on failure (reuses `useCreatePost` pieces) |
| UI | `PhotoDrawer.tsx` | "Make a photo strip" card at the top (link to `/strip`); regular upload below unchanged |
| UI | `PostCard.tsx`, `AlbumStack.tsx` | strip card = the 3 photo thumbs stacked + **Strip** badge |
| UI | `PostViewer.tsx` | strip: the composite, contained, 9:16; **Save** for the owner only (`navigator.share({files})` when `canShare`, else `<a download>` to the owner route, plus the iOS "long-press and Save to Photos" hint like the QR) |
| UI | `MeDrawer.tsx` | strip rows use the composite thumbnail |
| Admin | `src/components/admin/StripTemplateSection.tsx` + `useStripTemplate.ts` | preview of the template with the windows; upload/replace, "Use default template"; window editor: drag to move, corner to resize, arrow keys, X/Y/W/H fields, "Same size for all three", Save layout, Reset; link to the guide |
| Docs | `docs/strip-template-guide.md` | the designer's guide (P9): 1080 × 1920, PNG/JPG ≤ 3 MB, draw empty boxes, Instagram covers the top 250 px and bottom 340 px |
| Docs | `docs/adr/004-photo-strip.md`, `CLAUDE.md`, `docs/PLAN.md` | the decisions above; routes and data model; progress |

All colours stay tokens in `theme.css` (the editor uses the viewer/paper tokens; the admin section uses the
admin surface). The strip editor is a dark full-screen page like the viewer.

## Steps (each ends green: lint, typecheck, tests ≥ 80 %, build)

1. **Domain rules first (TDD).** `strip.ts` geometry (cover, clamp, crop, window validation) and the strip
   shape / type derivation in `uploads.ts`, `posts.ts` filters and labels. Pure functions, full tests.
2. **Database + server** (after your OK on the rule change). Migration 0008, regenerate types, `layout` through
   `/api/uploads` → intent → `create_post_from_intent`; `wall_counts`; owner-only `/api/posts/{id}/strip`;
   `/strip/template`. Route tests: a strip is accepted only with the exact shape; an album with
   `layout: "strip"` is rejected; a non-owner gets 403 on Save.
3. **Default template asset.** Render the design's art to `public/strip/default-template.png`, check it at
   1080 × 1920, and the names drawn by `composeStrip` in the names font.
4. **Composer.** `composeStrip` with a test that checks the crop rectangles handed to `drawImage` (canvas mocked)
   and a Playwright check that a composed image is 1080 × 1920 and each window holds its photo.
5. **Editor page.** `StripEditor`, `StripWindow`, gestures, bin, discard confirm, post flow with real progress.
   Tests: tap empty window opens the picker; post is off until 3; Delete key removes; hold + drop on bin
   removes; drop elsewhere snaps back; pan/zoom never leave a gap (clamp).
6. **Wall, viewer, Me drawer.** Strip card with badge, Photos filter, viewer composite, Save only for the owner.
7. **Admin.** Template upload/replace/default (dimension check), window editor and save. Tests for the
   windows schema (overlap, outside, too small) and the admin routes.
8. **Photos drawer entry** and the empty states; e2e (both phone profiles): make a strip with 3 photos, see the
   card on the wall with the badge, open it, Save visible for the owner and not for a second guest.
9. **Docs**: ADR 004, CLAUDE.md, the template guide, PLAN.md progress. Real-device check list below.

## Risks

- **Canvas memory on older iPhones**: a 1080 × 1920 canvas plus three 2048 px photos is fine on iOS 15+, but
  each photo is decoded once and released (`ImageBitmap.close()`); the composite is made only at Post.
- **iOS long-press**: Safari's callout and text selection fight a 450 ms hold. Needs `-webkit-touch-callout:
  none`, `user-select: none` and `contextmenu` prevented on the window; check on a real iPhone.
- **Pinch vs. page zoom**: `touch-action: none` on the windows only; the rest of the page keeps normal touch.
- **Template upload size**: a 1080 × 1920 PNG with photos in it can be over 3 MB; the error says to export as JPG.

## Real-device checks (iPhone Safari + Android Chrome, slow 3G)

1. Make a strip: tap each window, pinch and drag, hold and drop a photo on the bin, refill, post.
2. The wall card shows the stack with **Strip**; the viewer shows the full image.
3. Save: iPhone share sheet → Save Image, and straight to Instagram story: nothing important under Instagram's
   bars. Android: the file downloads.
4. A second guest sees no Save button; the owner route refuses them.
5. Admin: upload a JPG template, move and resize the windows, save; a new strip uses them; an older strip is unchanged.

## Open questions (not blocking)

- Other guests can still long-press or screenshot a strip in the viewer; only the Save button is hidden.
  Kept as is unless the owner asks otherwise.
