# Kategoria Design Scheme

**Version: 1.0.3** · Established 2026-08-30 · Direction: **Candy Pop** (teal-lead)

## Decisions & rationale
| ID | Decision | Rationale |
|----|----------|-----------|
| Dir A | Candy Pop direction | Duolingo-like warmth + energy; chunky pressable 3D buttons read as toy-like and obviously tappable for kids |
| C2 | Teal-lead palette on warm cream | Calmer default screens than pink-lead; pink reserved for big/celebration moments |
| F1 | Nunito for Latin + Cyrillic, Rubik for Hebrew + Arabic (both self-hosted) | Rounded/friendly; Nunito has no Hebrew or Arabic glyphs, so Rubik (rounded corners, real variable weights) draws those instead of a faux-bold system font |
| S1 | Cozy type scale (body 17, display 40) | Five category inputs fit one phone screen during a round |
| R1 | Chunky & snug shape (4px spacing base, radius 16/24, light shadow) | Matches mockup; snug enough for round screen density |
| MA | Bouncy-toy motion (spring overshoot 200–350ms) | Playful-but-purposeful; motion only as feedback/celebration, never while typing/thinking |
| M1–M10 | Component set | See components.json + references/refine-5-components.html |
| D1 | Warm cocoa dark theme | Stays on-brand warm; dark buttons flip to bright fills + dark text for AA |
| S1–S4 | Loading/empty/error patterns | Skeleton/spinner/emoji-empty/friendly error card — plain words, always an alternative action |

## Hard rules
1. **Logical CSS properties only** (`margin-inline-start`, `padding-block`, `inset-inline-end`) — RTL support is a requirement.
2. **AA + kid sizes**: body text contrast ≥4.5:1, body ≥16px (ours: 17px), touch targets ≥48px (chips ≥44px).
3. **No external font/asset URLs** — Nunito (latin + cyrillic) and Rubik (hebrew + arabic) are self-hosted via `@fontsource-variable`; the token names the fontsource family names (`Nunito Variable`, `Rubik Variable`).
4. **No raw values in app code** — colors/spacing/radii/fonts come from tokens (`var(--…)` from exports/tokens.css). Verify treats violations as errors (long-lived project).
5. **Scores/timers use tabular figures.**
6. **Minimal distraction**: max ~3 primary actions per screen; nothing animates while players type/think.

## Keep list
- (new project — nothing inherited)

## Quarantine
- (none)

## Changelog
- 1.0.3 (2026-09-26) — font fix: the token named `Nunito` but the bundled face is `Nunito Variable`, so the self-hosted font never loaded (only machines with Nunito installed showed it). Token now uses the fontsource names and adds Rubik for Hebrew + Arabic.
- 1.0.2 (2026-09-26) — `size` tokens for touch targets (`--size-touch` 48px, `--size-touch-chip` 44px) replace the hard-coded minimums in components and screens.
- 1.0.1 (2026-09-19) — semantic `scrim` color token (modal backdrop, both themes).
- 1.0.0 (2026-08-30) — Initial scheme: interview → 3 directions (A chosen) → refinements C2, F1+S1, R1, MA, M1–M10, D1 all approved. Commits prefixed `design-approve:`.
