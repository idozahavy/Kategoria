# Test gaps report - Kategoria

Full run 2026-09-10: mapped at 660072b (previous map 3120cba, 2026-09-04; 25 commits since), written in three phase commits (B 523b38e, D bd499f1, E 0e5c3e4). Scope: whole repo. Runner: vitest 4.1.11 (node v24.18.0), colocated `*.test.ts`.
HTML version: `test-gaps-report.html` (gitignored).

## Result

| Metric                                        | Before (660072b) | After (0e5c3e4)                            |
| --------------------------------------------- | ---------------- | ------------------------------------------ |
| tests                                         | 203              | 231 (+28)                                  |
| line_pct                                      | 86.18            | 91.11                                      |
| branch_pct_lit (files with >= 1 covered line) | 84.1             | 90.8                                       |
| dark_files                                    | 1 (avatar.ts)    | 1 (avatar.ts)                              |
| functions_unexecuted                          | 34               | 25                                         |
| mutation_score                                | not measured     | not measured (no tool configured)          |
| suite wall time (median of 3)                 | 2325 ms          | 2522 ms (+8.5 %, under the 10 % threshold) |
| red-proven                                    | -                | 28 / 28                                    |

Gaps closed per phase: B 3 (GAP-026, GAP-027, GAP-025), D 3 (GAP-029, GAP-028, GAP-024), E 3 (GAP-023, GAP-022, GAP-030). Phase A had nothing to repair; Phase F had no writable regression (d66dc0a touches only NewGame.svelte); Phase G has no end-to-end harness.

Reconciliation: seven files now read 100 % lines; BUG-001 (unvalidated host-message payloads on guests) and BUG-002 (peer-level error after join never closing the guest room) are fixed as of 2026-09-26 (see section 6); db.ts, avatar.ts and every Svelte screen remain untested because the repo has no IndexedDB fake and no DOM environment - one dev-dependency decision each.

## 1. Must-cover violations

Must-cover paths with no covering test: 4 (all `needs-harness`, no DOM test environment in the repo)

- `src/screens/Round.svelte` - round timer / time-up (GAP-019)
- `src/screens/Join.svelte` - guest waiting for the host (GAP-019)
- `src/screens/Scoreboard.svelte` - auto-continue countdown (GAP-019)
- `src/screens/Review.svelte` - device-vote ballot orchestration (GAP-019, added to must-cover this run)

The other must-cover paths are covered: game.ts 100 % lines, p2p.ts 100 %, vote.ts 100 %, turn-credentials.ts 100 %, turnstile.ts 100 %, qrscan.ts 100 %. Floors in `TESTING.md` raised to match (p2p, turnstile, qrscan now 100).
No `docs/project/CONVENTIONS.md` - `TESTING.md` is the only policy file. No `/cleanup` hand-off found.

## 2. Suite health (after Phase A - nothing to repair)

- Failing: 0 of 231 (26 files). `svelte-check`: 0 errors, 0 warnings.
- Skipped / todo / only: 0. Un-skipped: 0. Deleted: 0. Quarantined: 0. Expired quarantines: none.
- Flaky: 0 - three consecutive runs identical before and after the run.
- Tautologies: 0 before the run; one test written this run was reshaped after review (sound "resumed once" claimed a de-dup the source does not make - reduced to a single call).
- Snapshots: 0.

## 3. Tooling

| Tool                                           | Status                                    |
| ---------------------------------------------- | ----------------------------------------- |
| vitest 4.1.11                                  | found (repo devDependency)                |
| @vitest/coverage-v8 4.1.11                     | found (repo devDependency)                |
| svelte-check 4                                 | found                                     |
| mutation tool                                  | none configured - not installed           |
| DOM env (jsdom / happy-dom / @testing-library) | not installed - Svelte screens untestable |
| fake-indexeddb                                 | not installed - db.ts untestable          |

Excluded from coverage (vitest.config.ts): `**/*.test.ts`, `**/*.test-helpers.ts`, `src/vite-env.d.ts`, `src/main.ts`, `src/lib/i18n/{ar,en,es,fr,he,ru}.ts`, `src/lib/words/*.json`. `.svelte` files are outside the `include` list, so screens carry no coverage number (Suspected only).

## 4. Summary table

Rank = points / effort weight (S=1, M=2, L=4), ties by path.

| # | ID | Unit (file:line) | Points | Effort | Evidence | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GAP-026 | src/lib/p2p.ts:145 guards: over-long avatar, non-object ICE entry, non-object TURN body | 11 Critical | S | M | B | done 523b38e, red 3/3 |
| 2 | GAP-025 | functions/turn-credentials.ts:54 non-object token body, no caller IP, siteverify without `success` | 7 High | S | M | B | done 523b38e, red 3/3 |
| 3 | GAP-029 | src/lib/categoryprefs.ts:23 parseCustom: 50-entry cap, non-string customName | 6 Medium | S | M | D | done bd499f1, red 1/1 |
| 4 | GAP-027 | src/lib/p2p.ts:360 lifecycle edges: reopen timeout, stale-conn ping, lobby avatar keep, stranger leaving, conn error before welcome | 11 Critical | M | M | B | done 523b38e, red 5/5 |
| 5 | GAP-023 | src/lib/qrscan.ts:80 startQrScan poll loop: native detector, decode error, not-ready frames | 9 High | M | M | E | done 0e5c3e4, red 3/3 |
| 6 | GAP-030 | src/lib/sound.ts:27 audio(): suspended context is resumed | 4 Medium | S | M | E | done 0e5c3e4, red 1/1 |
| 7 | GAP-022 | src/lib/qrscan.ts:25 hasCamera + decodeWithCanvas (jsQR fallback, ctor fallback, skipped frames) | 8 High | M | M | E | done 0e5c3e4, red 4/4 |
| 8 | GAP-028 | src/lib/validation.ts:92 checkWordWithin never throws; wordFact offline; Wikidata cooldown / queue; Wiktionary body without pages | 8 High | M | M | D | done bd499f1, red 5/5 |
| 9 | GAP-024 | src/lib/turnstile.ts:34 script load failure retried, token timeout, api missing after load | 7 High | M | M | D | done bd499f1, red 3/3 |
| 10 | GAP-018 | src/lib/db.ts:62 all IndexedDB functions | 8 High | L | M | E | needs-harness |
| 11 | GAP-019 | src/screens Round / Join / Scoreboard / Review logic | 7 High | L | S | G | needs-harness |
| 12 | GAP-021 | src/lib/avatar.ts:32 fileToAvatar | 4 Medium | L | M | E | needs-harness |

The 20 gaps closed in the 2026-09-04/05 runs stay `done` in `.test-gaps-state.md`.

## 5. Gaps left open

- GAP-018 db.ts - `needs-harness`: no `fake-indexeddb` in the repo; this command never adds a test library.
- GAP-019 Round / Join / Scoreboard / Review screens - `needs-harness`: no DOM environment or component-testing library. Also holds the only Phase F candidate (d66dc0a, speed-bonus default in NewGame.svelte).
- GAP-021 avatar.ts - `needs-harness`: canvas + Image.
- GAP-002 held case "peer-level error after a successful join reaches onClose" - was `blocked-by-bug` BUG-002, now covered by the BUG-002 regression tests in `p2p.guest.test.ts`.
- GAP-011 held case "a chunk that fails to load is retried" - `needs-seam` (import.meta.glob loaders).

Adding `fake-indexeddb` and `jsdom` as dev dependencies would unblock GAP-018 and GAP-019 in the next run.

## 6. Suspected bugs

None new this run (none from ranking, none from rule 8 pre-break failures). Both accepted in triage on 2026-09-04; fixed on 2026-09-26:

- BUG-001 (fixed) - src/lib/p2p.ts - `isHostMessage` checked only that `type` was a known string; payload fields were used unvalidated on the guest device. Now validates every `HostMessage` variant's payload (types, array shapes, nested category/answer/standing-row fields), accepting `null` for fields the wire turns `undefined` into. Regression: `p2p.guest.test.ts` ("BUG-001: forwards every real message shape a host screen actually sends", "BUG-001: rejects host messages whose payload does not match the declared type", "BUG-001: isHostMessage rejects a payload that only has a valid type field").
- BUG-002 (fixed) - src/lib/p2p.ts - a peer-level 'error' after a successful join was swallowed, so onClose never fired. `joinRoom` now also listens for `disconnected` and `close`, and fires `onClose` exactly once for the cascade. Regression: `p2p.guest.test.ts` ("BUG-002: a peer error after join fires onClose exactly once, even with a cascade", "BUG-002: a peer \"disconnected\" alone (no error) still closes the guest room", "BUG-002: intentionally closing the session does not also fire onClose from the peer").

## 7. Send to /cleanup

None found this run.

## 8. Checked, found fine (skip while the file is unchanged)

| File                   | Last commit | Note                                                                                                     |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| src/lib/vote.ts        | a5fa0d2     | 100 / 100; tally edge cases (half, ties, shrinking quorum, zero voters) all asserted                     |
| src/lib/game.ts        | dff71a6     | 100 % lines; the 9 uncovered branches are `?? 0` / `?? 'A'` fallbacks unreachable through the public API |
| src/lib/p2p.ts         | d2be4f6     | 100 % lines; remaining uncovered branches are double-fire guards (`if (settled) return`)                 |
| src/lib/stores.ts      | 390975f     | 100 / 100                                                                                                |
| src/lib/storage.ts     | 4fa4c3a     | 100 / 100                                                                                                |
| src/lib/session.ts     | 3415020     | 100 / 100                                                                                                |
| src/lib/theme.ts       | 3415020     | 100 / 100                                                                                                |
| src/lib/bot.ts         | 3415020     | 100 / 100                                                                                                |
| src/lib/categories.ts  | 390975f     | 100 / 100                                                                                                |
| src/lib/i18n/index.ts  | 3415020     | registerPack is a one-line setter (excluded as trivial); line 40 `?? ''` unreachable                     |
| src/lib/words/index.ts | 390975f     | failed-chunk branch is needs-seam (GAP-011)                                                              |

Exclusions: type-only 1 (`src/lib/types.ts`), bootstrap 1 (`src/main.ts`), language packs 6, word lists 6 JSON, test helpers 1, trivial setter 1, `.svelte` UI components without logic 10 (`src/lib/ui/*`), `qa/` and `design/` per TESTING.md. Excluded by CLEANUP.md: 0 (no file).

## Before this run

Mapped 2026-09-10 at 660072b: 203 tests, line_pct 86.18, branch_pct_lit 84.1, dark_files 1, functions_unexecuted 34, wall 2325 ms. Per-file before: turn-credentials 100 / 92.1, categoryprefs 100 / 94.87, p2p 98.29 / 91.36, qrscan 52.45 / 22.58, sound 100 / 95, turnstile 79.48 / 70, validation 97.82 / 92.55 (line % / branch %). Suite health at map time: 0 failing, 0 skipped, 0 flaky, 0 tautologies, 0 snapshots.
