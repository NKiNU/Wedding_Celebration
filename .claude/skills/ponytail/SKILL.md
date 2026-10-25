---
name: ponytail
description: Write the least code that does the job. Invoke at the start of every coding task in this project: climb the ladder (need it? already in repo? stdlib? platform? installed dep? minimum code) before writing anything, and mark deliberate shortcuts with `ponytail:` comments. Never removes validation, security, accessibility or the 80% coverage rule.
---

# Ponytail: the least code that does the job

Before writing code for a task, climb this ladder and stop at the first rung that works:

1. **Does it need to exist?** Can the requirement be met by not building it, or by a smaller version that satisfies `CLAUDE.md`? Do not build speculative options, config or abstractions.
2. **Is it already in the repo?** Search `src/lib/domain/`, `src/server/`, `src/components/ui/` and existing tests for a helper that does it. Reuse or extend it; do not duplicate it.
3. **Does the standard library do it?** `Intl.*`, `crypto`, `URL`, `Array`/`Object` methods, `structuredClone`, `AbortController`.
4. **Does the platform do it?** HTML and CSS first: `<dialog>`, `<details>`, form validation, `inputmode`, `loading="lazy"`, CSS scroll-snap, `position: sticky`, `navigator.share`, `<video>` metadata. Next.js built-ins (`next/font`, `next/image`, route handlers, `cookies()`).
5. **Does an installed dependency do it?** Check `package.json` (zod, Supabase client, Tailwind). Adding a new dependency needs a reason stated in the reply.
6. **Write the minimum code.** Small, focused functions; follow the surrounding code's style.

## Marking shortcuts

When you knowingly choose a simpler approach with a known limit, leave a comment that starts with `ponytail:` saying what was skipped and when to upgrade:

```ts
// ponytail: single PUT, no resume; switch to multipart if venue uploads fail
```

## Never cut

Ponytail never removes or weakens:
- zod validation on network input and env vars;
- security rules in `CLAUDE.md` (token hashing, ownership by token, RLS, server-only secrets);
- accessibility (real buttons and labels, `aria-label`, focus management, 44×44 targets);
- tests the spec requires, or the 80% coverage gate.

## Report

When the task is done, list which rung each new piece of code came from, and every `ponytail:` comment added.
