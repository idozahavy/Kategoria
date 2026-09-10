# Test gaps report - Kategoria

Mapped 2026-09-10 at commit 660072b (previous map 3120cba, 2026-09-04; 25 commits since). Scope: whole repo. Runner: vitest 4.1.11 (node v24.18.0), colocated `*.test.ts`.
HTML version: `test-gaps-report.html` (gitignored).

## 1. Must-cover violations

Must-cover paths with no covering test: 4 (all `needs-harness`, no DOM test environment in the repo)

- `src/screens/Round.svelte` - round timer / time-up (GAP-019)
- `src/screens/Join.svelte` - guest waiting for the host (GAP-019)
- `src/screens/Scoreboard.svelte` - auto-continue countdown (GAP-019)
- `src/screens/Review.svelte` - device-vote ballot orchestration (GAP-019, added to must-cover this run)

The other must-cover paths are covered: game.ts 100 % lines, p2p.ts 98.3 %, vote.ts 100 %, turn-credentials.ts 100 %, turnstile.ts 79.5 % (floor 75), qrscan.ts 52.5 % (floor 50).
No `docs/project/CONVENTIONS.md` - `TESTING.md` is the only policy file. No `/cleanup` hand-off found (`.cleanup-state.md` has no `## untested-critical`).

## 2. Suite health

- Failing: 0 of 203 (26 files). `svelte-check`: 0 errors, 0 warnings.
- Skipped / todo / only: 0.
- Flaky: 0 - three consecutive runs identical (2445 / 2325 / 2310 ms). Grep sweep: one real `setTimeout` inside a fetch fake (validation.wikidata.test.ts:119, under fake timers - fine); the `Math.random` hit is a comment.
- Tautologies: 0 - every `not.toThrow()` / `toBeDefined()` / `not.toBeNull()` (10 hits) sits beside at least one outcome assertion in the same test.
- Snapshots: 0.
- Quarantines: none, none expired.
- Slowest tests: not reported by the runner in this configuration (whole suite 1.6 s of test time).

## 3. Tooling

| Tool | Status |
| --- | --- |
| vitest 4.1.11 | found (repo devDependency) |
| @vitest/coverage-v8 4.1.11 | found (repo devDependency) |
| svelte-check 4 | found |
| mutation tool | none configured - not installed |
| DOM env (jsdom / happy-dom / @testing-library) | not installed - Svelte screens untestable |
| fake-indexeddb | not installed - db.ts untestable |

Excluded from coverage (vitest.config.ts): `**/*.test.ts`, `**/*.test-helpers.ts`, `src/vite-env.d.ts`, `src/main.ts`, `src/lib/i18n/{ar,en,es,fr,he,ru}.ts`, `src/lib/words/*.json`. `.svelte` files are outside the `include` list, so screens carry no coverage number at all (Suspected only).

Coverage baseline (`npx vitest run --coverage`):

| Metric | Value |
| --- | --- |
| line_pct | 86.18 |
| branch_pct_lit (files with >= 1 covered line) | 84.1 |
| dark_files | 1 (`src/lib/avatar.ts`; `types.ts` is type-only and excluded) |
| functions_unexecuted | 34 (19 of them in db.ts, 5 in qrscan.ts) |
| mutation_score | not measured |
| wall time | 2325 ms median of 3 |

## 4. Summary table

Rank = points / effort weight (S=1, M=2, L=4), ties by path. Only `open` gaps and the harness-blocked ones are listed; the 20 gaps closed in earlier runs stay `done` in `.test-gaps-state.md`.

| # | ID | Unit (file:line) | Points | Effort | Evidence | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GAP-026 | src/lib/p2p.ts:145 guards: over-long avatar, non-object ICE entry, non-object TURN body | 11 Critical | S | M | B | open |
| 2 | GAP-025 | functions/turn-credentials.ts:54 non-object token body, no caller IP, siteverify without `success` | 7 High | S | M | B | open |
| 3 | GAP-029 | src/lib/categoryprefs.ts:23 parseCustom: 50-entry cap, non-string customName | 6 Medium | S | M | D | open |
| 4 | GAP-027 | src/lib/p2p.ts:360 lifecycle edges: reopen timeout, stale-conn ping, lobby avatar keep, conn error after join | 11 Critical | M | M | B | open |
| 5 | GAP-023 | src/lib/qrscan.ts:80 startQrScan poll loop: native detector, decode error, not-ready frames | 9 High | M | M | E | open |
| 6 | GAP-030 | src/lib/sound.ts:27 audio(): suspended context is resumed | 4 Medium | S | M | E | open |
| 7 | GAP-022 | src/lib/qrscan.ts:25 hasCamera + decodeWithCanvas (jsQR fallback) | 8 High | M | M | E | open |
| 8 | GAP-028 | src/lib/validation.ts:92 checkWordWithin never throws; wordFact offline; Wikidata cooldown / queue; Wiktionary body without pages | 8 High | M | M | D | open |
| 9 | GAP-024 | src/lib/turnstile.ts:34 script load failure retried, token timeout, api missing after load | 7 High | M | M | D | open |
| 10 | GAP-018 | src/lib/db.ts:62 all IndexedDB functions | 8 High | L | M | E | needs-harness |
| 11 | GAP-019 | src/screens Round / Join / Scoreboard / Review logic | 7 High | L | S | G | needs-harness |
| 12 | GAP-021 | src/lib/avatar.ts:32 fileToAvatar | 4 Medium | L | M | E | needs-harness |

Uniform signals: none - importer counts range 0..10 and churn 0..14 across the units.

## 5. Gaps in detail

### GAP-026 - p2p guards (src/lib/p2p.ts:145, :217, :250)
- Why it matters: `isGuestMessage` and `isIceServerArray` are the only validation between untrusted P2P / HTTP payloads and the host's state; p2p.ts is imported from 8 files and changed 14 times in six months.
- Untested: an avatar string over 400 000 chars (p2p.ts:158), a non-object entry in the ICE list (p2p.ts:220), a `/turn-credentials` body that is not an object (p2p.ts:264).
- Test plan: see `.test-gaps-state.md`.
- Boundaries to fake: fetch (already stubbed in p2p.host.test.ts), PeerJS (`vi.mock('peerjs')` via p2p.test-helpers).
- Points 11 (+3 uncovered lines, +3 must-cover / untrusted input, +2 importers, +1 churn, +1 external input, +1 length). Effort S. Measured. Phase B. open.

### GAP-025 - turn-credentials token edge cases (functions/turn-credentials.ts:54, :72)
- Why it matters: this endpoint hands out a two-hour TURN relay pass; every branch of the bot check is a way to get one for free.
- Untested: a JSON body that is a string or array (line 58 - must count as no token), no `CF-Connecting-IP` header (line 85 - `remoteip` must be omitted, not sent as null), a siteverify 200 whose body lacks `success` (line 92 - must be `failed`, not `passed`).
- Boundaries to fake: fetch (stubVerifyThenMint helper exists).
- Points 7 (+2 branches, +3 auth / must-cover, +1 external input, +1 branches > 5). Effort S. Measured. Phase B. open.

### GAP-029 - categoryprefs parseCustom (src/lib/categoryprefs.ts:23)
- Why it matters: parses whatever localStorage holds; a bad entry would poison the setup screen on every launch.
- Untested: the 50-entry cap (line 28) and a `customName` that is not a string (line 32).
- Boundaries to fake: localStorage (stubStorage helper exists).
- Points 6 (+3 uncovered lines, +1 importer, +1 external input, +1 branches > 5). Effort S. Measured. Phase D. open.

### GAP-027 - p2p lifecycle edges (src/lib/p2p.ts:360, :515, :560, :715)
- Why it matters: seat reclaim and reconnect are the must-cover behaviours; the uncovered paths are exactly the "device came back / link died" moments.
- Untested: reopenRoom broker timeout (372-375), a ping from a superseded connection refreshing a seat it no longer owns (563), a returning lobby device without an avatar keeping the old one (521), a connection error after a successful join reaching onClose (719).
- Boundaries to fake: PeerJS fake, fake timers, localStorage (all in p2p.test-helpers).
- Points 11 (as GAP-026). Effort M. Measured. Phase B. open.

### GAP-023 - qrscan poll loop (src/lib/qrscan.ts:80-143)
- Why it matters: the join-by-QR path; a regression here means kids type codes by hand. Named in the opening question.
- Untested: everything after the camera opens - the 200 ms tick, native `BarcodeDetector` detection, stop + `ondetect` on the first payload, the decode-error branch, the not-ready and busy guards.
- Boundaries to fake: navigator.mediaDevices (stubCamera exists), `BarcodeDetector` global, `HTMLMediaElement.HAVE_ENOUGH_DATA` global, fake timers, console.error.
- Points 9 (+3 uncovered lines, +3 named, +1 importer, +1 external input, +1 length). Effort M. Measured. Phase E. open.

### GAP-030 - sound.ts audio() resume (src/lib/sound.ts:27)
- Untested: an AudioContext born `suspended` (autoplay policy) is resumed before the first chime (line 30).
- Boundaries to fake: AudioContext (stubAudio exists; add a `state` override).
- Points 4 (+3 uncovered line, +1 importers). Effort S. Measured. Phase E. open.

### GAP-022 - qrscan hasCamera + decodeWithCanvas (src/lib/qrscan.ts:25, :62)
- Re-evaluated from needs-harness: a fake canvas object (`getContext` returning `drawImage` / `getImageData` stubs) and `vi.mock('jsqr')` are enough; no DOM env needed.
- Untested: `hasCamera` on secure / insecure contexts; the jsQR fallback path through the canvas; a canvas without a 2d context; a video with zero dimensions.
- Points 8 (+3, +3 named, +1 importer, +1 external input). Effort M. Measured. Phase E. open.

### GAP-028 - validation edge paths (src/lib/validation.ts:92, :191, :258, :280, :339)
- Untested: `checkWordWithin` resolving 'vote' on a rejecting check (107-108), `wordFact` with the network down (214), Wikidata entity-search HTTP error setting the one-minute cooldown (263 -> 320) and the cooldown short-circuit inside the queue (295-296), the queue surviving a failed run (325), a Wiktionary body without `query.pages` (366).
- Boundaries to fake: fetch (stubFetch helpers exist), fake timers, `./db` mock.
- Points 8 (+3 uncovered lines, +1 importers, +1 bug-fix commit 82cd032, +1 churn, +1 external input, +1 length). Effort M. Measured. Phase D. open.

### GAP-024 - turnstile failure paths (src/lib/turnstile.ts:34, :62)
- Untested: a script load failure is forgotten so the next room retries (46-53), a widget that never answers times out to null after 10 s (73-74), `window.turnstile` missing after the script loaded (68 -> 93-94).
- Boundaries to fake: document / window (stubDom, installTurnstile helpers exist), fake timers, import.meta.env (vi.stubEnv).
- Points 7 (+3 uncovered lines, +3 named, +1 importer). Effort M. Measured. Phase D. open.

### GAP-018 / GAP-019 / GAP-021 - harness-blocked
- db.ts needs `fake-indexeddb`; the Svelte screens need a DOM environment plus a component-testing library; avatar.ts needs canvas + Image. None of these is in the repo and this command never adds a test library (rule 1). Each is one decision away: adding `fake-indexeddb` and `jsdom` as dev dependencies would unblock GAP-018 and GAP-019.

## 6. Suspected bugs

None new this run. Still open from 2026-09-04 (both accepted in triage, awaiting a separate fix):

- BUG-001 - src/lib/p2p.ts:194 - `isHostMessage` checks only that `type` is a known string; payload fields are used unvalidated on the guest device. Medium.
- BUG-002 - src/lib/p2p.ts:656 - a peer-level 'error' after a successful join is swallowed, so onClose never fires. Low.

## 7. Top quick wins (High or Critical, S effort, Measured, not blocked)

Only two gaps qualify:

1. GAP-026 - p2p guards (Critical, S)
2. GAP-025 - turn-credentials token edge cases (High, S)

Next cheapest: GAP-029 (Medium, S), GAP-030 (Medium, S), GAP-027 (Critical, M).

## 8. Send to /cleanup

None found this run - no dead exports in scope.

## 9. Checked, found fine (skip while the file is unchanged)

| File | Last commit | Note |
| --- | --- | --- |
| src/lib/vote.ts | a5fa0d2 | 100 / 100; tally edge cases (half, ties, shrinking quorum, zero voters) all asserted |
| src/lib/game.ts | dff71a6 | 100 % lines; the 9 uncovered branches are `?? 0` / `?? 'A'` fallbacks unreachable through the public API |
| src/lib/stores.ts | 390975f | 100 / 100 |
| src/lib/storage.ts | 4fa4c3a | 100 / 100 |
| src/lib/session.ts | 3415020 | 100 / 100 |
| src/lib/theme.ts | 3415020 | 100 / 100 |
| src/lib/bot.ts | 3415020 | 100 / 100 |
| src/lib/categories.ts | 390975f | 100 / 100 |
| src/lib/i18n/index.ts | 3415020 | registerPack is a one-line setter (excluded as trivial); line 40 `?? ''` unreachable |
| src/lib/words/index.ts | 390975f | failed-chunk branch is needs-seam (GAP-011) |

Exclusions: type-only 1 (`src/lib/types.ts`), bootstrap 1 (`src/main.ts`), language packs 6, word lists 6 JSON, test helpers 1, trivial setter 1, `.svelte` UI components without logic 10 (`src/lib/ui/*`), `qa/` and `design/` per TESTING.md. Excluded by CLEANUP.md: 0 (no file).
