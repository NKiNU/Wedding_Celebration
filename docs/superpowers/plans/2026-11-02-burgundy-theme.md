# Plan: burgundy theme

Status: **implemented on `test` (2026-11-02), not committed.** Deviations: the admin status bar stays burgundy (fix 7 skipped: the no-hex lint rule covers `admin/page.tsx`); the active filter pill count went from `opacity-70` to `opacity-80` (axe: 4.3:1 → 5.5:1); the surface rules sit in `@layer base` so the FAB's `text-paper` still wins. Android e2e and the Playwright MCP walkthrough passed; iPhone (WebKit) e2e passed in the Playwright container (WebKit does not start on Fedora 44 directly). (written 2026-11-02). Nothing is implemented yet.

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
  - Light grey with burgundy text: the wall feed, all drawers, the delete popup, the + menu, the + button.
- **Admin colour set**: `data-surface="admin"` holds today's monochrome `:root` values, so admin looks as it does now.

## 0. Before starting

When this was written, the repo was on branch `test` with an unfinished merge (conflicts in `docs/PLAN.md`,
`WishTicker.tsx`, `validation.ts`, `server/admin.ts`, …). Wait until that merge is finished or aborted. Then
branch off the agreed base (`main`, or `test` after the merge).

## 1. Approach: a lighter colour set for parts of the page

Every colour already comes from variables in `src/styles/theme.css`, and the components use names like `bg-card`
and `text-ink`. Those names resolve to whatever the variables hold at that point in the page. So:

- **Main colours** (`:root`) become burgundy. This covers the welcome screen, the wall header, the filter bar and the viewer.
- **A light colour set** is switched on by `data-surface="light"` on an element. Inside it, the same names
  resolve to the grey colours. This covers the feed, drawers, the delete popup, the + menu, the + button.
- **Admin colour set**: `data-surface="admin"` holds today's monochrome `:root` values, so admin looks as it does now.

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
| `--card` note | the canvas uses #F2F2F2 (feed) and #EDEDED (drawers); one value, #F0F0F0, on purpose |
| `--feed-pattern` | halftone dots in burgundy at 13%: radial-gradient(rgba(94,30,43,.13) 1px, transparent 1.35px) 0 0 / 6px 6px |
| shadows | lighter |

### `[data-surface="admin"]`

Today's monochrome values from `:root` (ink #141414, paper #f4f3ef, card #ffffff, soft #c9d3dc, muted #62625e,
line #dcdad3, sheet #fbfaf7, feed, shadows), moved here unchanged.

### Related fixes in the same file

- **Text colour:** `body` sets `color: var(--ink)`, and the browser works that out once on `body` (silver), then
  passes the finished colour down. Text without its own class (card author names, + menu labels, empty state, admin)
  would stay silver on grey. So both surface rules also set `color: var(--ink);`.
- **Wireframe theme:** the light rules must not apply under `[data-theme="wireframe"]`, so the selector excludes it
  (e.g. `:root:not([data-theme="wireframe"]) [data-surface="light"]`), and the same for `[data-surface="admin"]`.
  The grey review theme stays as it is, admin included.
- **Backdrops:** the darkened layers behind drawers, the delete popup and the + menu read `--ink` (`bg-ink/50`,
  `bg-ink/55`). With `--ink` silver at the root, the + menu backdrop would turn into a light haze; the canvas shows
  a dark one. New token `--scrim: rgba(26, 6, 11, 0.5)` replaces all three. iOS Safari before 17.4 gives the
  dialog `::backdrop` no variables at all, not even ones from `:root`, so define it in both places:
  `:root, ::backdrop { --scrim: rgba(26, 6, 11, 0.5); }`.
- **Dark mode:** set `color-scheme: only light` (CSS, and `colorScheme: "only light"` in the viewport settings in
  `src/app/layout.tsx`). Chrome's "Darken websites" / auto dark mode then leaves the site alone. Samsung Internet
  mostly respects it too, but not always: test once on a Samsung phone with its dark mode on.

## 3. Component changes (attribute and class only)

| File | Change |
|---|---|
| `src/components/wall/Wall.tsx` | `data-surface="light"` on the feed `<main>` |
| `src/components/drawers/BottomSheet.tsx` | `data-surface="light"` on the `<dialog>` (covers all six drawers) |
| `src/components/drawers/BottomSheet.tsx` | `backdrop:bg-ink/50` → `backdrop:bg-(--scrim)` |
| `src/components/ui/ConfirmDialog.tsx` | `data-surface="light"` on the `<dialog>`; `backdrop:bg-ink/55` → `backdrop:bg-(--scrim)` |
| `src/components/wall/ActionMenu.tsx` | `data-surface="light"` on the menu list; `SURFACE` and the hint `<li>`: `bg-card` → `bg-sheet` (the canvas pills use the drawer colour); backdrop button `bg-ink/50` → `bg-(--scrim)` |
| `src/components/wall/Fab.tsx` | `data-surface="light"` (burgundy button, silver icon) |
| `src/components/ui/Toast.tsx` | none: it already uses `bg-ink text-paper`, so under `:root` it is silver with burgundy text, as in the prototype |
| `src/app/admin/page.tsx` | wrap both returns (login and dashboard) in `<div data-surface="admin" className="min-h-dvh bg-paper">`: the `<main>` inside is only `max-w-sm` / `max-w-2xl` wide, so the attribute on it would leave a burgundy page around admin. Also `export const viewport = { themeColor: "#f4f3ef" }` so the admin status bar stays light |
| `src/app/layout.tsx` | browser status-bar colour `#f4f3ef` → `#5E1E2B`; `colorScheme: "only light"` |

No changes needed to the header, filter bar, cards, AlbumStack, welcome screen or viewer.

## 4. Docs

- `CLAUDE.md`, Theming section (**[rule]**: approving this plan counts as the OK to edit it): replace the
  "Default theme (pure monochrome)" example with the burgundy values and describe the light colour set.
- `docs/PLAN.md`: a short note that the palette changed.

## 5. Tests and checks

- **Unit tests:** none new. A test that only checks the attribute passes even when the colours are wrong.
- **Accessibility test:** `tests/e2e/a11y.spec.ts` already checks contrast across welcome, wall, drawers, viewer and
  admin login, in both themes. It catches unreadable text (like silver on grey). No existing unit test checks the changed class names.
- **Full suite:** `npm run lint`, `npm run typecheck`, `npm run test` (80% coverage floor), `npm run test:e2e`.
- **End-to-end walkthrough with the Playwright MCP** (after the code is in, before the phone check):
  - Setup, once: `claude mcp add playwright -- npx @playwright/mcp@latest --device "iPhone 15"`
    (a second run with `--device "Pixel 7"` for Android Chrome). Not connected in this project yet.
    Needs `npx supabase start`, `npx supabase db reset` (seed) and `npm run dev`.
  - Walk the 13 canvas screens in order and screenshot each next to its canvas artboard:
    welcome, name taken, wall, + menu, photos, video, wish, DuitNow QR, wish view, album viewer,
    video viewer, Me drawer, delete confirm. Then a toast (post a wish), the toast over an open
    drawer (Download QR), `/admin` and the wireframe theme (`data-theme="wireframe"` on `<html>`).
  - On each screen, read the computed colours (`getComputedStyle`) of: page background, header,
    feed, card author name, drawer, dialog `::backdrop`, + menu scrim and pills, FAB, toast, admin page edges. Compare with section 2.
  - Report: one screenshot pair per screen and a list of mismatches. Fix, then re-run the walkthrough.
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
