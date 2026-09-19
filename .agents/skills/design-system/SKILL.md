---
name: design-system
description: Kategoria visual design scheme — read before ANY UI work (creating/editing Svelte components, CSS, HTML, screens, styles).
---

Rules:

1. Check `design/.lock` matches `design/tokens.json` version before styling; on mismatch stop and re-read the design folder.
2. New views start from the nearest reference mockup (`design/references/direction-a.html`, `refine-5-components.html`, `refine-6-states-dark.html`) or the most similar compliant component — never from scratch.
3. Use only tokens (`design/exports/tokens.css` vars) — no raw colors/px; logical CSS properties only; touch targets ≥48px; run `node design/scripts/verify-design.mjs` after UI changes; log undefined decisions to `design/open-questions.md`, don't improvise.

Sources of truth: `design/tokens.json` · `design/components.json` · `design/scheme.md`.
