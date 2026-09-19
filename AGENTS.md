# Kategoria

Kid-friendly Scattergories-style word game. Svelte + Vite + TypeScript, static build on Cloudflare Pages plus one Pages Function (`functions/turn-credentials.ts`) that mints TURN credentials, IndexedDB saves, multi-language incl. RTL.

<!-- design-scheme:start -->

A locked design scheme exists. Before any UI work, follow the `design-system` skill (`.agents/skills/design-system/SKILL.md`). Tokens/components/rules live in `design/`; verify with `node design/scripts/verify-design.mjs`.
<!-- design-scheme:end -->

<!-- code-scheme:start -->

A locked code scheme exists. Before writing any code in `src/`, follow the `code-conventions` skill (`.agents/skills/code-conventions/SKILL.md`); source of truth is `CODESTYLE.md`. After changes: `npm run format`, `npm run lint`, `npm run check` must pass.
<!-- code-scheme:end -->
