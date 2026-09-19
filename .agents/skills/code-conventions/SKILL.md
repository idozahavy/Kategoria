---
name: code-conventions
description: Kategoria coding conventions — read before writing or reviewing ANY code in src/ (TypeScript, Svelte, stores, i18n).
---

Rules:

1. Read `CODESTYLE.md` (source of truth). Highlights: Svelte 5 runes only (no `export let`/`on:click`), strict TS (no `any`), screens in `src/screens/`, dumb components in `src/lib/ui/`, logic in `src/lib/`.
2. Every user-facing string via `$t('key')` added to ALL packs in `src/lib/i18n/`; every running-game mutation via `updateGame()`; styling via design tokens only (see `design-system` skill).
3. After changes run all six gates (CODESTYLE.md §Verify): `npm run format:check`, `npm run lint`, `npm run check`, `npm test`, `npm run check:i18n`, `npm run verify:design` — all must pass.
