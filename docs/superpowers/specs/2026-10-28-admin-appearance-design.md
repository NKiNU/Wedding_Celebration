# Admin appearance: fonts and monogram image

Date: 2026-10-28. Status: draft for approval.

## Intent

The couple's designer works in Canva. They want the guest app to look like the invitation. Today the three fonts and the "A & S" monogram (the two initials) are fixed in code. The admin should be able to change them from `/admin` without a deploy.

## What the admin can do

A new **Appearance** section in `/admin`.

1. **Monogram image.** Upload one transparent-background image holding both letters. It replaces the text initials in two places: the large monogram on the welcome screen (`src/components/ui/Monogram.tsx`) and the small initials in the wall header (`src/components/wall/WallHeader.tsx`). A "Remove" button goes back to the text initials, which is also the default when nothing is uploaded.
2. **Fonts.** Three separate pickers, each choosing one font from a fixed list:
   - **Couple names**: also the font of the text monogram and the wall header initials (today the `--font-script` token, Pinyon Script).
   - **Wishes**: today the `--font-serif` token, Cormorant Garamond italic.
   - **Everything else**: today the `--font-body` token, Poppins.

   Each picker shows every option written in its own typeface, and a live preview before saving. Saving applies the choice to all guests.

## Goals

- Admin changes fonts and monogram with no developer help.
- Guests see the new look on their next page load. No realtime push is needed.
- With nothing configured, the app looks exactly as it does today.

## Non-goals

- Colours, radii, shadows (still `theme.css` only).
- Uploading font files.
- Separate B and G images.
- Per-guest or per-device appearance.

## Anti-goals (a failure even if it works)

- A font name or hex value hardcoded inside a component (ESLint forbids it; CLAUDE.md "Theming" rule).
- Guests downloading all 15–20 fonts on every page.
- An uploaded file that is not really an image being served from the media domain, or an SVG that can run script.
- The wireframe theme (client review theme, system font) breaking. It must still win over the admin's font choice.

## Decisions made with the owner

- One image for both letters.
- Fonts chosen separately per role (the three above).
- Curated fixed list, about 15–20 Google Fonts, no custom font upload.
- The image replaces both the welcome and wall header monograms.
- Preview: dropdown options drawn in their own font, plus a live preview.

## Calls made by the designer (not yet confirmed by the owner)

- The font list lives in code as a typed list of keys, and the database stores only the key. An unknown key falls back to the default for that role.
- The monogram image is stored in R2 like the DuitNow QR and uses the same presign then confirm flow (`presignQr`/`confirmQr` in `src/server/admin.ts`, key rule in `src/lib/domain/uploads.ts`). Replacing it deletes the old file.
- Allowed image types: PNG, WebP and SVG (owner asked for SVG). The size cap is a named constant in `limits.ts`; 1 MB suggested.
- SVG safety, because an SVG can carry scripts: it is only ever rendered through an `<img>` tag (never inlined, never opened as a page), and `confirm` reads the stored file and rejects it if it contains `<script`, `on…=` event-handler attributes, `<foreignObject`, or references to external URLs. Text inside an SVG may depend on fonts the guest's phone lacks, so the admin screen should hint "convert text to outlines" when exporting from Canva.
- Three new nullable columns on `events` hold the font keys and one holds the image path; null means the default. Added by a new migration plus regenerated `database.types.ts`.
- The monogram image is served from `NEXT_PUBLIC_MEDIA_BASE_URL` with its unguessable key, like post media. It is public, as the QR is.

## Constraints from the existing code

- `src/app/layout.tsx` loads the three fonts with `next/font/google`, which requires fonts to be declared statically at build time. The builder decides how to offer the whole list while guests download only the fonts the event actually uses (for example, declaring all with `preload: false` and setting only the chosen CSS variable).
- `theme.css` maps `--font-script`, `--font-serif` and `--font-body` to `next/font` variables. The admin's choice should change what those tokens point to, not touch components. The wireframe theme overrides these tokens and must keep winning.
- `getEvent()` (`src/server/event.ts`) and `EVENT_COLUMNS` are the single read of the event row; the new columns go through them.
- Server writes go through route handlers with `requireAdmin`; request bodies are validated with zod in `src/lib/validation.ts`.
- Coverage floor is 80%. Tests for: font-key validation and fallback, image key and type validation, SVG rejection (script, event handlers, foreignObject, external references), `updateEvent` with the new fields, and the monogram falling back to text.

## Left to the builder

- Exact font list (about 15–20; cover script, serif and clean sans-serif; every font must support Latin, including Malay).
- How the font picker is built (custom listbox vs native select with styled options) and its layout inside the admin page.
- How the chosen fonts reach `<html>` (CSS class or inline CSS variable) and the exact loading strategy.
- Image display sizing so a wide or tall image fits both monogram spots without distortion.
- Whether the wall header image needs a different size from the welcome one.
