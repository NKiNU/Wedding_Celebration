# Plan: burgundy theme

Status: **questions answered, waiting for the merge on `test` to be resolved** (written 2026-11-02). Nothing is implemented yet.

## Context

- Design reference: Claude canvas "Wedding Memories, Burgundy",
  https://claude.ai/artifact/Gfm7hciUDNNGnWdRKDYpJK (playable prototype, before/after slider, 13 screens).
  The original monochrome canvas is https://claude.ai/artifact/9Dm3X7ujxRQmnSmEJ7sv3m (unchanged).
- Colours from the client:
  - #5E1E2B burgundy: the main colour.
  - #DADCDD silver: accent.
  - #9C9D9B grey: accent.
  - #D9D9D9 light grey: drawers, popups, the + menu and the wall feed.
- Layout of the design:
  - Burgundy: the welcome screen, the wall header (with the filter pills) and the viewer.
  - Light grey with burgundy text: the wall feed, all drawers, the delete popup, the + menu, the + button and toasts.

## 0. Before starting

When this was written, the repo was on branch `test` with an unfinished merge (conflicts in `docs/PLAN.md`,
`WishTicker.tsx`, `validation.ts`, `server/admin.ts`, …). Wait until that merge is finished or aborted. Then
branch off the agreed base (`main`, or `test` after the merge).

## 1. Approach: a lighter colour set for parts of the page

Every colour already comes from variables in `src/styles/theme.css`, and the components use names like `bg-card`
and `text-ink`. Those names resolve to whatever the variables hold at that point in the page. So:

- **Main colours** (`:root`) become burgundy. This covers the welcome screen, the wall header, the filter bar, the viewer and admin.
- **A light colour set** is switched on by `data-surface="light"` on an element. Inside it, the same names
  resolve to the grey colours. This covers the feed, drawers, the delete popup, the + menu, the + button and toasts.

Components keep their classes and stay free of hex values (the ESLint rule still holds).

## 2. Colour values (`src/styles/theme.css`)

### `:root` (burgundy)

| Variable | Current | New | Used for |
|---|---|---|---|
| `--paper` | #f4f3ef | #5E1E2B | page background |
| `--ink` | #141414 | #DADCDD | text, primary buttons |
| `--card` | #ffffff | #45141F | name chip, wish ticker, inactive pills |
| `--soft` | #c9d3dc | #3A1019 | name input on welcome |
| `--muted` | #62625e | #9C9D9B | secondary text (4.6:1 contrast on burgundy) |
| `--line` | #dcdad3 | #7A3A47 | borders |
| `--decor` | #b5b3ac | #9C9D9B | floral line art |
| `--viewer` | #0e0e0e | #1A070B | photo/video viewer |
| `--wish-bg` / `--wish-ink` | ink / paper | unchanged | |
| shadows, `--overlay*` | neutral black | burgundy-tinted near-black, e.g. rgba(26,6,11,…) | |

### `[data-surface="light"]`

| Variable | Value |
|---|---|
| `--ink` | #5E1E2B (burgundy text) |
| `--paper` | #DADCDD (text on burgundy buttons) |
| `--sheet` | #D9D9D9 |
| `--feed` | #D9D9D9 |
| `--card` | #F0F0F0 |
| `--soft` | #C4C4C4 |
| `--muted` | #4F4F4E (5.8:1; #9C9D9B is about 2:1 on this grey) |
| `--line` | #B3B3B3 |
| `--decor` | #9C9D9B |
| `--wish-bg` / `--wish-ink` | #5E1E2B / #DADCDD |
| `--feed-pattern` | halftone dots in burgundy at 13%: radial-gradient(rgba(94,30,43,.13) 1px, transparent 1.35px) 0 0 / 6px 6px |
| `--dial-bg` (new) | #D9D9D9 (+ menu pills and icons) |
| shadows | lighter |

### Related fixes in the same file

- **Wireframe theme:** the light rules must not apply under `[data-theme="wireframe"]`, so the selector excludes it
  (e.g. `:root:not([data-theme="wireframe"]) [data-surface="light"]`). The grey review theme stays as it is.
- **Popup backdrop:** the darkened background behind drawers and the delete popup reads `--ink`. iOS Safari before 17.4 doesn't
  pass variables to that backdrop layer, so give it its own fixed `--scrim` variable instead.
- **Dark mode:** set `color-scheme: only light` (CSS, and `colorScheme: "only light"` in the viewport settings in
  `src/app/layout.tsx`). Chrome's "Darken websites" / auto dark mode then leaves the site alone. Samsung Internet
  mostly respects it too, but not always: test once on a Samsung phone with its dark mode on.

## 3. Component changes (attribute and class only)

| File | Change |
|---|---|
| `src/components/wall/Wall.tsx` | `data-surface="light"` on the feed `<main>` |
| `src/components/drawers/BottomSheet.tsx` | `data-surface="light"` on the `<dialog>` (covers all six drawers) |
| `src/components/ui/ConfirmDialog.tsx` | `data-surface="light"` on the `<dialog>` |
| `src/components/wall/ActionMenu.tsx` | `data-surface="light"` on the menu list; `SURFACE` and the hint `<li>`: `bg-card` → `bg-(--dial-bg)` |
| `src/components/wall/Fab.tsx` | `data-surface="light"` (burgundy button, silver icon) |
| `src/components/ui/Toast.tsx` | none: it already uses `bg-ink text-paper`, so under `:root` it is silver with burgundy text, as in the prototype |
| `src/app/admin/page.tsx` | `data-surface="admin"` on the admin root (keeps today's monochrome look) |
| `src/app/layout.tsx` | browser status-bar colour `#f4f3ef` → `#5E1E2B`; `colorScheme: "only light"` |

No changes needed to the header, filter bar, cards, AlbumStack, welcome screen or viewer.

## 4. Docs

- `CLAUDE.md`, Theming section (**[rule]**: approving this plan counts as the OK to edit it): replace the
  "Default theme (pure monochrome)" example with the burgundy values and describe the light colour set.
- `docs/PLAN.md`: a short note that the palette changed.

## 5. Tests and checks

- **Unit tests:** one small test per affected component checking that it has `data-surface="light"`.
- **Accessibility test:** `tests/e2e/a11y.spec.ts` already checks contrast across welcome, wall, drawer and viewer.
- **Full suite:** `npm run lint`, `npm run typecheck`, `npm run test` (80% coverage floor), `npm run test:e2e`.
- **Manual:** a real iPhone (Safari) and Android (Chrome). Check the colour under the notch, the drawer backdrop,
  text in input fields, and Samsung Internet dark mode.

## 6. Open questions (answer before implementing)

Answered 2026-11-02:

1. Toast: as in the prototype, silver with burgundy text and no backdrop of its own. The darkening seen around
   it in the prototype is the drawer's backdrop (e.g. Download QR keeps the QR drawer open). The real app does the
   same: the toast is a popover above an open drawer. Known trade-off: on the bare #D9D9D9 wall silver is low-contrast;
   the shadow carries it. Check on a phone.
2. Admin keeps its current monochrome look: the old `:root` values move to `[data-surface="admin"]`.
3. Old monochrome as a switchable guest theme: dropped (only admin keeps those values).
4. Admin Appearance (fonts, monogram) is not affected.
5. The user resolves the mid-merge on `test` themselves.

Estimate: 1–2 hours including tests.
