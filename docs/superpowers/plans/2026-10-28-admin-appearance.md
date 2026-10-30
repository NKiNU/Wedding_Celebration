# Admin Appearance (fonts + monogram image) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin picks three fonts from a curated list and uploads one transparent monogram image that replaces the text initials on the welcome screen and the wall header.

**Architecture:** Four nullable columns on `events` hold the three font keys and the monogram's R2 path. Fonts: every curated font is declared once with `next/font/google` (`preload: false`, so a phone only downloads the faces the page really uses); a small server component writes three CSS variables for the chosen keys, and `theme.css` tokens read them. The monogram reuses the DuitNow QR flow (presign, PUT to R2, confirm) with an extra SVG safety scan, and is shown with a plain `<img>` from the media domain.

**Tech Stack:** Next.js (App Router, `cacheComponents`), Supabase Postgres, Cloudflare R2, Tailwind v4 tokens, zod, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-admin-appearance-design.md`

## Global Constraints

- TypeScript strict, no `any`. Server-only code imports `server-only`.
- No hex values and no font names (`Poppins`, `Pinyon`, `Cormorant`, or any new family) in `src/components` or `src/app/**/*.tsx` other than `src/app/layout.tsx` and `src/app/fonts.ts` (ESLint `no-restricted-syntax`; extend the ignore list to `fonts.ts`).
- Request bodies are validated with zod in `src/lib/validation.ts`; admin routes call `requireAdmin(await cookies())` and go through `handle(req, ...)`.
- Defaults must keep today's look: names `pinyon-script`, wishes `cormorant-garamond`, body `poppins`; no monogram image means the text initials.
- Image types PNG, WebP, SVG; size cap `MAX_MONOGRAM_BYTES = 1 * MB` (named constant in `limits.ts`).
- The `[data-theme="wireframe"]` block in `theme.css` must keep overriding the three font tokens.
- UI work (Tasks 6 and 7) follows mobile-native and ui-ux-pro-max: touch targets at least 44 by 44 px with 8 px between them; every input, textarea and select at 16 px or larger; `:hover` styles only inside `@media (hover: hover) and (pointer: fine)`, and a `:active` press state on every tappable element (no layout-shifting transforms); `touch-action: manipulation` on buttons and labels that act as buttons; fixed or sticky bars respect `env(safe-area-inset-*)`; no emoji as icons (SVG only); a visible label on every control and `aria-label` on icon-only buttons; text contrast at least 4.5:1 using the existing theme tokens; no horizontal scroll at 375 px width; no animation beyond 150 to 300 ms and none that ignores `prefers-reduced-motion`; remove actions that destroy data (Remove monogram) go through the existing `ConfirmDialog`. Ponytail applies throughout: native elements and the existing helpers before any new component or dependency.
- Coverage floor 80% (`npm run test`). Run `npm run lint` and `npm run typecheck` before each commit.
- Commit messages: `<type>: <description>` and end with the two attribution lines from the session (Co-Authored-By and Claude-Session).

## Review Focus

- A font key in the database that is no longer in the list (list edited later) renders the role's default, not an error or an empty `font-family`. (Task 1, Task 3)
- An SVG containing `<script`, `onload=`, `<foreignObject`, `javascript:` or an external `href`/`url()` is refused at confirm, and the uploaded object is deleted. (Task 2, Task 4)
- Confirm with another event's key, a QR key, or a key whose extension does not match the stored type is `invalid_key`/`upload_incomplete` and changes nothing. (Task 4)
- Removing the monogram when none exists succeeds without error; replacing one deletes the old object but keeps the new one live if that delete fails. (Task 4)
- The value written into the page's `<style>` can only ever be `var(--font-<known key>)`, never text from the database. (Task 1, Task 5)

---

### Task 1: Font catalogue and style output (pure)

**Files:**
- Create: `src/lib/domain/fonts.ts`
- Test: `src/lib/domain/fonts.test.ts`

**Interfaces:**
- Produces:
  - `type FontRole = "names" | "wishes" | "body"`; `type FontKind = "script" | "serif" | "sans"`
  - `type FontOption = { key: string; label: string; kind: FontKind }`
  - `const FONT_OPTIONS: readonly FontOption[]` (16 to 20 entries, at least 6 script, 5 serif, 5 sans; keys are the kebab-case Google family name, e.g. `great-vibes`; all must cover Latin)
  - `const DEFAULT_FONTS: Record<FontRole, string>` = `{ names: "pinyon-script", wishes: "cormorant-garamond", body: "poppins" }`
  - `isFontKey(key: unknown): key is string`
  - `fontOrDefault(role: FontRole, key: string | null | undefined): string` (unknown or null gives the default)
  - `fontVar(key: string): string` returns `--font-${key}`
  - `themeCss(fonts: Record<FontRole, string | null | undefined>): string` returns `:root{--font-choice-names:var(--font-X);--font-choice-wishes:var(--font-Y);--font-choice-body:var(--font-Z)}` with every key passed through `fontOrDefault`

- [ ] **Step 1: Write failing tests** in `fonts.test.ts`:
  - `has unique keys and includes the three defaults` (`DEFAULT_FONTS` values are all in `FONT_OPTIONS`; no duplicate keys; every key matches `/^[a-z0-9-]+$/`)
  - `falls back to the default for null, undefined and unknown keys` (`fontOrDefault("names", "nope") === "pinyon-script"`)
  - `themeCss only ever emits var() of known keys` (`themeCss({ names: "x;}body{display:none", wishes: null, body: "lora" })` equals the string with `pinyon-script`, `cormorant-garamond`, `lora`)
- [ ] **Step 2:** Run `npx vitest run src/lib/domain/fonts.test.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `fonts.ts` to the signatures above.
- [ ] **Step 4:** Run the same command; expect PASS.
- [ ] **Step 5:** Commit `feat: curated font catalogue and theme css for the admin appearance`.

### Task 2: Monogram image rules (pure)

**Files:**
- Modify: `src/lib/domain/limits.ts` (add `MONOGRAM_MIMES = ["image/png", "image/webp", "image/svg+xml"] as const`, `MAX_MONOGRAM_BYTES = 1 * MB`)
- Modify: `src/lib/domain/uploads.ts`
- Test: `src/lib/domain/uploads.test.ts`

**Interfaces:**
- Produces in `uploads.ts`:
  - `monogramKey(eventId: string, id: string, mime: string): string` gives `events/${eventId}/admin/monogram-${id}.${png|webp|svg}`; throws for other mimes
  - `monogramMime(key: string): string | null` from the extension
  - `monogramProblem(mime: string, bytes: number): string | null` (type message "The monogram must be a PNG, WebP or SVG image."; size message "The monogram image must be under 1 MB.")
  - `svgProblem(text: string): string | null` returns a message when the text lacks `<svg` or contains, case-insensitively: `<script`, an `on<word>=` attribute, `<foreignObject`, `javascript:`, `<!ENTITY`, `@import`, or an `href`/`xlink:href`/`url(` whose target starts with `http:`, `https:` or `//`; otherwise null. `data:` hrefs and `#id` hrefs are allowed.
  - `looksLike` gains `"image/webp"`: bytes 0 to 3 are `RIFF` and 8 to 11 are `WEBP`.

- [ ] **Step 1: Write failing tests**: `monogramKey builds png, webp and svg keys and rejects gif`; `monogramProblem accepts the three types and rejects gif and files over 1 MB`; `looksLike accepts a WebP header and rejects RIFF without WEBP`; `svgProblem accepts a plain path svg and one using #id and data: hrefs`; `svgProblem rejects` as a table over: `<svg><script>x</script></svg>`, `<svg onload="x()">`, `<svg><foreignObject/></svg>`, `<svg><a href="javascript:x"/></svg>`, `<svg><image href="https://evil.test/a.png"/></svg>`, `<svg><image xlink:href="//evil.test/a.png"/></svg>`, `<svg style="fill:url(https://evil.test/x)">`, `<SVG ONLOAD=x>`, and text with no `<svg`.
- [ ] **Step 2:** Run `npx vitest run src/lib/domain/uploads.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement. One regex per rule in a small list is enough; no XML parser.
- [ ] **Step 4:** Run the same command; expect PASS.
- [ ] **Step 5:** Commit `feat: monogram image rules and svg safety scan`.

### Task 3: Database, event read, admin event fields

**Files:**
- Create: `supabase/migrations/0006_appearance.sql`
- Modify: `src/lib/database.types.ts`, `src/server/event.ts`, `src/server/admin.ts`, `src/server/wall.ts` (export `mediaUrl`), `src/lib/api.ts`, `src/lib/validation.ts`, `src/components/admin/useAdminEvent.ts` (extend `EventPatch`)
- Test: `src/server/admin.test.ts`, `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: `fontOrDefault`, `isFontKey`, `FontRole` from Task 1.
- Produces:
  - Migration adds nullable text columns to `public.events`: `font_names`, `font_wishes`, `font_body`, `monogram_path` (no policy change; `events` is already readable by anon).
  - `EVENT_COLUMNS` includes the four columns.
  - `mediaUrl(key: string | null): string | null` exported from `wall.ts`.
  - `AdminEvent` gains `fonts: Record<FontRole, string>` (resolved with defaults) and `monogramUrl: string | null`.
  - `updateEventBody` gains optional `fontNames`, `fontWishes`, `fontBody`, each `z.string().refine(isFontKey, "Choose one of the listed fonts.")`; `updateEvent` writes them to `font_names`, `font_wishes`, `font_body`.

- [ ] **Step 1: Write failing tests.** In `admin.test.ts`: extend `eventRow` with the four fields (null); `getAdminEvent returns default fonts and no monogram when the columns are null`; `getAdminEvent returns the stored fonts and a media url for the monogram` (`font_names: "great-vibes"`, `monogram_path: "events/e/admin/monogram-1.png"` gives `https://media.example.com/events/e/admin/monogram-1.png`); `getAdminEvent falls back to the default for a font key that is not in the list`; `updateEvent writes font_names, font_wishes and font_body`. In `validation.test.ts`: `updateEventBody accepts a listed font and rejects an unknown one`.
- [ ] **Step 2:** Run `npx vitest run src/server/admin.test.ts src/lib/validation.test.ts`; expect FAIL.
- [ ] **Step 3:** Write the migration, update `database.types.ts` (regenerate with `npx supabase gen types typescript --local` when Docker is up; otherwise hand-add the four `string | null` columns to the `events` Row, Insert and Update types), then implement the rest to the signatures above. Apply the migration locally with `npx supabase db reset`.
- [ ] **Step 4:** Run the same command; expect PASS. Also run `npm run typecheck`.
- [ ] **Step 5:** Commit `feat: events store font choices and the monogram path`.

### Task 4: Monogram upload, confirm and remove (server + route)

**Files:**
- Modify: `src/server/r2.ts` (add `read` to the `R2` type and implementation), `tests/fixtures/r2.ts` (fake `read`; `StoredObject` gains optional `body?: Uint8Array`), `src/server/admin.ts`, `src/lib/api.ts` (rename `QrUpload` to `ImageUpload`, update its users), `src/lib/validation.ts`
- Create: `src/app/api/admin/monogram/route.ts`
- Test: `src/server/admin.test.ts`, `src/app/api/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: `monogramKey`, `monogramMime`, `monogramProblem`, `svgProblem`, `looksLike`, `MAX_MONOGRAM_BYTES` (Task 2); `EVENT_COLUMNS`, `toAdminEvent` (Task 3).
- Produces:
  - `R2.read(key: string, maxBytes: number): Promise<Uint8Array | null>`: whole object; null when missing; throws when larger than `maxBytes`.
  - `presignMonogram(mime: string, bytes: number): Promise<ImageUpload>`, `confirmMonogram(key: string): Promise<AdminEvent>`, `removeMonogram(): Promise<AdminEvent>` in `admin.ts`.
  - zod `monogramPresignBody` (`{ mime, bytes }` checked by `monogramProblem`) and `monogramConfirmBody` (`{ key }`) in `validation.ts`.
  - `POST /api/admin/monogram` (201, presign), `PUT` (confirm), `DELETE` (remove), all admin-only.
  - `confirmMonogram` order: key matches `^events/${eventId}/admin/monogram-[0-9a-f-]{36}\.(png|webp|svg)$` else `invalid_key` 400; `head` exists, type equals `monogramMime(key)`, not `overridden`, bytes at most the cap; PNG/WebP then `peek` + `looksLike`; SVG then `read` and `svgProblem(new TextDecoder().decode(bytes))`. Any failure after the key check deletes the uploaded object (best effort) and throws `upload_incomplete` 400, or `unsafe_svg` 400 with message "That SVG can’t be used. Export it again without scripts or links." On success set `monogram_path`, then delete the previous object best effort (log, never throw), as `confirmQr` does.
  - `removeMonogram` sets `monogram_path` to null and deletes the old object best effort; with no monogram it only returns the event.

- [ ] **Step 1: Write failing tests** in `admin.test.ts` (mirror the `the QR` block): presign returns a key under `events/<id>/admin/monogram-` and signs the declared mime and bytes; confirm makes a verified PNG the monogram and deletes the old one; confirm keeps the new monogram when deleting the old fails; confirm rejects another event's key, a `qr-` key, and a key whose stored type differs; confirm rejects an SVG with `<script` (`unsafe_svg`) and deletes the object; confirm accepts a clean SVG; `removeMonogram` clears the path and deletes the file; `removeMonogram` with none does not call delete. In `admin-routes.test.ts`: POST/PUT/DELETE return 401 without the admin cookie and POST rejects a GIF with 400 (follow the `/api/admin/qr` cases there).
- [ ] **Step 2:** Run `npx vitest run src/server/admin.test.ts src/app/api/admin/admin-routes.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement to the signatures above. `R2.read`: GET the object, refuse when `content-length` exceeds `maxBytes`, read the body.
- [ ] **Step 4:** Run the same command; expect PASS, then `npm run typecheck`.
- [ ] **Step 5:** Commit `feat: admin can upload and remove a monogram image`.

### Task 5: Chosen fonts reach every page

**Files:**
- Create: `src/app/fonts.ts`, `src/app/ThemeStyle.tsx`
- Modify: `src/app/layout.tsx`, `src/styles/theme.css`, `eslint.config.mjs` (add `src/app/fonts.ts` to the ignores beside `layout.tsx`)
- Test: `src/app/fonts.test.ts`

**Interfaces:**
- Consumes: `FONT_OPTIONS`, `fontVar`, `themeCss`, `DEFAULT_FONTS` (Task 1); `getEvent` and the `font_*` columns (Task 3).
- Produces:
  - `src/app/fonts.ts` declares one `next/font/google` family per `FONT_OPTIONS` entry with `variable: fontVar(key)` written as a literal (`next/font` needs literals), `subsets: ["latin"]`, `preload: false`, `display: "swap"`, and the weights today's UI uses (400, 500, 600 for sans; 400 and 500 plus italic for serif; 400 for script). Exports `fontClassNames: string` (all `.variable` classes joined).
  - `ThemeStyle` is an async server component: `<style>{themeCss({ names: e.font_names, wishes: e.font_wishes, body: e.font_body })}</style>` from `getEvent()`.
  - `layout.tsx` puts `fontClassNames` on `<html>` and renders `<Suspense><ThemeStyle /></Suspense>` first in `<body>` (the pages already wait on `getEvent()` inside Suspense, so the style streams in with their content).
  - `theme.css` `:root` tokens become `--font-body: var(--font-choice-body, var(--font-poppins)), system-ui, sans-serif;`, `--font-script: var(--font-choice-names, var(--font-pinyon-script)), cursive;`, `--font-serif: var(--font-choice-wishes, var(--font-cormorant-garamond)), Georgia, serif;`. The wireframe block is untouched.

- [ ] **Step 1: Write failing tests** in `fonts.test.ts` (node environment, read files with `fs`): `fonts.ts declares a variable for every catalogue key` (for each `FONT_OPTIONS` key, the source contains `"--font-<key>"`); `theme.css keeps the wireframe theme overriding all three font tokens` (the `[data-theme="wireframe"]` block text contains `--font-body: system-ui`, `--font-script: system-ui`, `--font-serif: system-ui`).
- [ ] **Step 2:** Run `npx vitest run src/app/fonts.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement. Replace the three hard-coded declarations in `layout.tsx` with `fontClassNames`; grep `src` for `--font-pinyon`, `--font-cormorant` and `--font-poppins` and update any other user to the new variable names.
- [ ] **Step 4:** Run the test; expect PASS. Then `npm run build` (needs network for Google Fonts) and `npm run lint`; confirm the build output does not preload the unused fonts.
- [ ] **Step 5:** Commit `feat: guests see the event's chosen fonts`.

### Task 6: Monogram image on the welcome screen and wall header

**Files:**
- Modify: `src/components/ui/Monogram.tsx`, `src/components/welcome/WelcomeHeader.tsx`, `src/components/wall/WallHeader.tsx`, `src/components/wall/Wall.tsx`, `src/app/page.tsx`, `src/app/wall/WallContent.tsx`
- Test: `src/components/ui/Monogram.test.tsx` (new), and the existing WallHeader/Wall tests if they exist

**Interfaces:**
- Consumes: `mediaUrl` from `@/server/wall` and `event.monogram_path` (Task 3).
- Produces: `Monogram({ a, b, imageUrl }: { a: string; b: string; imageUrl?: string | null })`; `WelcomeHeader` and `WallHeader` and `Wall` take `monogramUrl?: string | null` and pass it down. With a URL the text initials are replaced by `<img src alt="" className="size-full object-contain">` inside the same sized box (200 by 150 on the welcome screen; in the wall header a box as tall as the initials' line with a `max-w` so a wide image cannot push the name chip off the row). The wireframe logo-box stand-in stays.

- [ ] **Step 1: Write failing tests**: `Monogram shows the initials when there is no image`; `Monogram shows the image and not the initials when an image url is given` (query by `container.querySelector("img")` and the initials text absent); `WallHeader shows the image instead of the initials`.
- [ ] **Step 2:** Run `npx vitest run src/components`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement and thread `monogramUrl` from `getEvent()` (via `mediaUrl(event.monogram_path)`) in `page.tsx` and `WallContent.tsx`.
- [ ] **Step 4:** Run `npx vitest run src/components`; expect PASS.
- [ ] **Step 5:** Commit `feat: monogram image replaces the text initials`.

### Task 7: Admin Appearance section

**Files:**
- Create: `src/components/admin/AppearanceSection.tsx`, `src/components/admin/FontPicker.tsx`, `src/components/admin/useMonogramUpload.ts`
- Modify: `src/components/admin/AdminDashboard.tsx`
- Test: `src/components/admin/admin.test.tsx`

**Interfaces:**
- Consumes: `AdminEvent.fonts`, `AdminEvent.monogramUrl` (Task 3); routes from Task 4; `EventPatch` fields `fontNames`, `fontWishes`, `fontBody`; `FONT_OPTIONS`, `fontVar`.
- Produces:
  - `FontPicker({ label, value, onChange, sampleText }: { label: string; value: string; onChange: (key: string) => void; sampleText: string })`: native, no listbox ARIA or open/close state. A `<details>` whose `<summary>` shows the current font's name and `sampleText` drawn in that font (`style={{ fontFamily: \`var(${fontVar(key)})\` }}`), and whose body is a `<fieldset>` with a `<legend>` (the label) of radio inputs, one `<label>` per `FONT_OPTIONS` entry drawn in its own font, grouped by kind. Choosing a radio calls `onChange` and closes the `<details>`. (Ponytail ruling: a native `<select>` cannot draw options in their own font on iOS, so details + radios is the smallest native alternative.)
  - `useMonogramUpload(onDone: (e: AdminEvent) => void)` returns `{ upload(file: File), remove(), progress, error }`, modelled on `useQrUpload` (check with `monogramProblem` first, presign, `putFile`, confirm); `remove` calls DELETE.
  - `AppearanceSection({ event, saving, save, onChanged })` renders the monogram box (preview of `monogramUrl`, "Upload image" or "Replace image" label wrapping a file input with `accept="image/png,image/webp,image/svg+xml"`, a "Remove (use text)" button when one exists, hint "Transparent PNG, WebP or SVG, up to 1 MB. For SVG, convert text to outlines before exporting.") and three `FontPicker`s (Couple names, Wishes, Everything else) with a "Save fonts" button enabled only when a choice changed, calling `save({ fontNames, fontWishes, fontBody })`.
  - `AdminDashboard` renders `<AppearanceSection ... onChanged={setEvent} />` after `QrSection`.

- [ ] **Step 1: Write failing tests** in `admin.test.tsx` (follow the `QrSection` cases): `Appearance shows the current fonts and the text-monogram hint when there is no image`; `choosing a font and saving sends fontNames, fontWishes and fontBody` (assert the `save` mock's argument); `Save fonts is disabled until a choice changes`; `uploading a PNG presigns, puts and confirms` (mock `api` and `putFile` as the QR test does); `uploading a GIF shows the type message without calling the server`; `Remove asks for confirmation, then calls DELETE and reports the updated event`; `choosing a radio in a FontPicker calls onChange and closes it`.
- [ ] **Step 2:** Run `npx vitest run src/components/admin`; expect FAIL.
- [ ] **Step 3:** Implement to the signatures above, reusing `Section`, `Field`-style classes and `Button` from the existing admin components.
- [ ] **Step 4:** Run the same command; expect PASS, then `npm run lint && npm run typecheck && npm run test` (coverage 80% floor).
- [ ] **Step 5:** Commit `feat: admin appearance section for fonts and monogram`.

### Task 8: Docs and device check

**Files:**
- Modify: `docs/PLAN.md` (progress note and the new `events` columns in its Data model section), `docs/DEPLOY.md` (the build downloads the curated Google Fonts, so the build host needs network; apply migration 0006)
- Modify: `CLAUDE.md` data-model block (the four `events` columns)

- [ ] **Step 1:** Make the doc edits.
- [ ] **Step 2:** Manual check on a real iPhone (Safari) and Android (Chrome), recorded in `docs/PLAN.md`: change each of the three fonts and reload `/`, `/wall` and a wish drawer; upload a transparent PNG and an SVG and check both monogram spots (including a very wide image); remove it and confirm the text initials return; confirm the wireframe theme still shows the system font.
- [ ] **Step 3:** Commit `docs: admin appearance in the plan, deploy notes and data model`.
