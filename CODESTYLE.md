# Code Scheme — Kategoria

**Version 1.6.0** · 2026-09-10 · Enforced by Prettier + ESLint (`npm run format` / `npm run lint`) and the `code-conventions` skill.

## Formatting (Prettier — do not hand-format)

2-space indent · single quotes · semicolons · trailing commas · 100-char lines · LF endings (`.gitattributes` normalizes).

## Language & framework

- TypeScript strict everywhere; no `any`, no `@ts-ignore`. Non-null `!` only when the invariant is obvious on the same screen of code.
- **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`, `$bindable`; event handlers as attributes (`onclick=`). Never `export let`, never `on:click`, no legacy reactive `$:`.
- Global cross-screen state lives in `src/lib/stores.ts` svelte stores, read in components via `$store`. Local screen state uses runes.

## Architecture & files

- `src/screens/` — one route-level component per screen (PascalCase, matches the `Screen` union in `types.ts`). Navigation = `screen.set(...)`; no router.
- `src/lib/ui/` — presentational components only (PascalCase). No game logic, no store imports, no data fetching; inputs via `$props`.
- `src/lib/` — logic/services in lowercase modules: `types.ts` (all shared domain types — extend it, don't redeclare shapes locally), `game.ts` (pure game rules), `db.ts` (IndexedDB only), `validation.ts` (word checking), `stores.ts`.
- `src/lib/i18n/` — one `LanguagePack` per file; `src/lib/words/` — word-list data.
- Tests: vitest, colocated as `src/**/<module>.test.ts` next to the module they cover; pure logic only (no network, no real IndexedDB). Run with `npm test`.
- Imports: relative paths within `src`; import types with `import type`; order is enforced by `simple-import-sort` (external packages, then `./`/`../` modules) — `npm run lint:fix` sorts, don't hand-order.

## Domain rules

- Every mutation of a running game goes through `updateGame()` (it persists to IndexedDB and returns a deep clone so `$derived` chains re-evaluate — same-reference mutation gets memoized away). Never mutate `$game` directly.
- `GameState` must hold only plain data: copy anything sourced from `$state` (e.g. `.map((x) => ({ ...x }))`) before putting it into a game — `$state` proxies throw `DataCloneError` in `structuredClone` and IndexedDB.
- Pure functions in `game.ts` take state explicitly; no store access outside components/`stores.ts`.
- No network calls except `validation.ts` (public dictionary), `p2p.ts` (WebRTC signaling via PeerJS), `turnstile.ts` (bot-check script) and `analytics.ts` (Umami tracker script); every network operation has a timeout and degrades gracefully (never throws raw errors to the UI). Analytics: report through `trackScreen`/`trackEvent` only, with plain-value data and no names, words or ids of players. `functions/` is server-side (Cloudflare Pages Functions) and is exempt — it runs outside the client bundle, not under this client-side rule.
- P2P: the host screen is authoritative; guests render what the host sends. All messages received over a DataConnection are untrusted — validate with the type guards in `p2p.ts` before use. The live room lives only in `p2p.ts`'s `activeRoom` singleton, never inside `GameState`.

## UI text & styling

- Every user-facing string goes through `$t('key')` with the key in **every** language pack; placeholders as `{name}`. `TODO-i18n` comments are debt to clear before merging.
- Styling: design tokens only (`var(--…)`), logical CSS properties only — see `design/scheme.md` hard rules; run `npm run verify:design` after UI work.

## Errors & async

- No floating promises: `await` or explicit `void`.
- User-visible failures use the friendly error-card pattern (S4) with an alternative action; log details with `console.error`, never show raw errors to players.

## Naming

- `camelCase` functions/variables, `PascalCase` types/components, `SCREAMING_SNAKE` module constants, kebab/lowercase file names outside components.
- Booleans read as predicates (`hasSaves`, `isFinished`); event props as `on<thing>` (`onback`, `onclick`).

## Commits

Prefix by area: `feat:`, `fix:`, `chore:`, `design:` / `design-approve:` / `design-migrate:` (reserved for the design scheme). Imperative subject, ≤72 chars.

## Verify

`npm run format:check` · `npm run lint` · `npm run check` (svelte-check) · `npm test` (vitest) · `npm run check:i18n` · `npm run verify:design`. All six must pass before a commit that touches `src/`.

## Changelog

- 1.6.0 (2026-09-10) — `analytics.ts` (Umami Cloud) joins the network-allowed modules (and `turnstile.ts`, which already loaded the bot-check script, is now listed too); events go through `trackEvent`, screens through `trackScreen`; never player data.
- 1.5.0 (2026-09-02) — `functions/turn-credentials.ts` Pages Function mints TURN credentials (server-side, exempt from the client no-network rule); wrangler pinned (`wrangler@4`); CI workflow (`.github/workflows/ci.yml`) runs all six verify gates plus build.
- 1.4.0 (2026-08-31) — vitest unit-test gate (`npm test`); colocated `*.test.ts`; predicate-named persisted booleans (user-approved, old saves orphaned).
- 1.3.0 (2026-08-31) — import auto-sorting via eslint-plugin-simple-import-sort (user-approved).
- 1.2.0 (2026-08-31) — i18n completeness gate (`npm run check:i18n`); UI language persisted + auto-detected; five gates instead of four.
- 1.1.0 (2026-08-31) — P2P layer: allow network in `p2p.ts`; host-authoritative message rules; `$state`-proxy plain-data rule for `GameState`.
- 1.0.0 (2026-08-30) — Initial code scheme: current-style Prettier, strict type-checked ESLint, npm-scripts enforcement (user-approved).
