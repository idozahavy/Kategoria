# Kategoria

Kid-friendly Scattergories-style word game. Svelte + Vite + TypeScript, static build on Cloudflare Pages plus one Pages Function (`functions/turn-credentials.ts`) that mints TURN credentials, IndexedDB saves, multi-language incl. RTL.

<!-- design-scheme:start -->

A locked design scheme exists. Before any UI work, follow the `design-system` skill (`.claude/skills/design-system/SKILL.md`). Tokens/components/rules live in `design/`; verify with `node design/scripts/verify-design.mjs`.
<!-- design-scheme:end -->

<!-- code-scheme:start -->

A locked code scheme exists. Before writing any code in `src/`, follow the `code-conventions` skill (`.claude/skills/code-conventions/SKILL.md`); source of truth is `CODESTYLE.md`. After changes: `npm run format`, `npm run lint`, `npm run check` must pass.
<!-- code-scheme:end -->

## How to run

`npm run dev:lan` — Vite dev server on http://localhost:5180 (also reachable as http://127.0.0.1:5180, a separate origin with its own storage — handy as a second "device").

## How to test

`npm test` (vitest), plus the other gates: `npm run format:check`, `npm run lint`, `npm run check`, `npm run check:i18n`, `npm run verify:design`.

## How to verify

`node tools/capture.mjs --screen <name|all> [--widths 390,820,1440] [--theme light|dark|both] [--frames N --interval MS]` — drives headless Chrome/Edge (no npm dependency) through the scripted flows in `tools/screens.json` and writes `qa/captures/<screen>-<shot>-<width>-<theme>.png`, then prints any console errors. `--list` names the screens. Attaches to the dev server on :5180 or starts it. Multi-device flows (a phones-join room) use one tab per device; `127.0.0.1` keeps a phone's storage apart from the host's. `/turn-credentials` 404s are expected in dev (the Pages Function only runs on Cloudflare).

## How to deploy

`npm run deploy` — builds and uploads `dist/` to Cloudflare Pages (project `kategoria`, https://kategoria.pages.dev).
