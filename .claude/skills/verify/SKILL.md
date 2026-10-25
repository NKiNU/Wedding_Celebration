---
name: verify
description: How to launch and drive this LMS client end-to-end to verify changes
---

# Verifying prod-learn-Client changes

## Test against the QA harness, NOT the demo data

The `@demo.lms` accounts below are for manual clicking and screenshots. **Do not
run automated tests against them** — they have been mutated by many sessions and
their state is no longer a known quantity.

Automated testing targets the **QA harness**: an isolated tenant
(`qa{N}-*@qa.harness`, password `Demo1234!`) with its own business owner,
trainer, students and courses, minted one generation at a time.

**Every test run starts with this, without exception:**

```bash
node scripts/qa-harness-status.mjs      # in prod-learn-server
```

It reports, per capability, whether the fixtures that capability needs are still
unconsumed. Then:

- **All SUITABLE** → run the tests against the current generation.
- **Anything SPENT** → **report the verdict and ASK the human whether to re-seed.**
  Never seed on your own initiative. Creating data is the human's decision.

Only when they say so:

```bash
node scripts/qa-harness-seed.mjs        # mints the next generation
node scripts/qa-harness-seed.mjs --dry-run
```

Each seed mints a NEW generation and **auto-prunes all but the last two**.
Pruning deletes that generation's `PointsTransaction` rows through the **native
driver**, because the append-only hooks block model-level deletes; it is
hard-scoped to that generation's users and refuses to run if it cannot establish
that scope.

Why generations rather than resetting fixed accounts: testing **consumes**
fixtures (a completed lesson cannot be completed again, spent points are spent),
and `seed-demo.js` is idempotent upserts — re-running it does **not** restore a
consumed account.

Harness fixtures per generation: `fresh1` and `fresh2` (0 pts, enrolled in
courses A and C — `fresh2` is the deliberate spare, worth exactly one extra full
run), `funded` (500 pts, no enrollments), `unenrolled` (no enrollments), plus
courses A (1 module / 2 lessons / 1 auto-gradable quiz — every award path
reachable in one pass), B (`paid_points`, 50 pts), C (3 modules / 6 lessons).
Courses are `publishingMode: 'exclusive'` to the generation's owner with
`enrollmentAccess: 'open'`, so they stay out of everyone else's catalog while
still permitting self-enrolment.

Existing end-to-end suite (resolves the newest generation itself, no ids to edit):

```bash
node scripts/qa-e2e-points-attribution.mjs        # defaults to :5001
API=http://localhost:5000/api node scripts/qa-e2e-points-attribution.mjs
```

## Launch
- API server: `C:/Users/acer/Desktop/prod-learn-server`, runs on port 5000. Client (Vite) on 5173. Both are usually already running — probe with `Test-NetConnection localhost -Port 5000/5173` before starting anything.
- The client calls the API directly at `http://localhost:5000/api` (VITE_API_URL, **no `/v1`**). Vite does NOT proxy `/api`, so in-page `fetch('/api/...')` returns index.html.
- For automated runs, start a **dedicated instance on :5001** rather than trusting :5000 to have picked up your edits — it guarantees current code and leaves the user's stack alone:
  `$env:PORT="5001"; $env:REDIS_ENABLED="false"; node ./src/index.js`
  (`REDIS_ENABLED=false` is required — the server otherwise dies on an unhandled Redis `ECONNRESET` from the Atlas IP allowlist.) Stop it when finished and re-probe :5000/:5173 to confirm they're untouched.

## Drive (Playwright MCP)
- Login page: `http://localhost:5173/login`. Demo password for all users: `Demo1234!`.
- Accounts: `pelajar1..5@demo.lms` (students), `jurulatih1@demo.lms` (trainer of Pengenalan Pengurusan Masa + Perjalanan Diri), `jurulatih2@demo.lms` (trainer of Mahir Kewangan), `admin@demo.lms` (system_admin).
- To switch accounts, `localStorage.clear()` + navigate to /login (the sidebar Log Keluar button is often covered and times out).
- Auth token for direct API calls from the page: `JSON.parse(JSON.parse(localStorage.getItem('persist:auth')).token)`.

## Gotchas
- **Daily-progress gate**: the server strips ALL module contents from `GET /api/courses/:id/modules` until the enrollment has a forum daily-progress post for today (`src/utils/courseAccessHelper.js` filterTreeForStudent). Modules showing "0/0 pelajaran" does NOT mean the course has no lessons — submit the daily post first.
- Course ids (seeded): Pengenalan Pengurusan Masa `6a44bf1a49b30fdfb915186c` (normal, has lessons in every module), Perjalanan Diri `6a44bf1a49b30fdfb915186d` (level course, modules have NO contents), Mahir Kewangan (paid).
- Submitting a daily post as a student is a cheap, repeatable way to un-gate a course for that day; it leaves a forum post behind (no UI to delete).
- Trainer can create/delete module contents via `POST /api/contents` / `DELETE /api/contents/:id` with `{ moduleId, title, blocks: JSON.stringify([{ order: 0, type: 'text', textContent: '<p>…</p>' }]) }`.

## Report PDFs (server)
- Renderer: `prod-learn-server/src/services/reportPdfService.js` + `reportDocBuilders.js` (ESM). Render sample PDFs headlessly with a small `.mjs` script importing them via `file:///` URLs, then Read the PDF directly to inspect layout.
