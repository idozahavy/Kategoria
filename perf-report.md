# Performance audit - Kategoria

Date: 2026-09-09. Commit at audit: d66dc0a. Mode: full, whole repo. No PERF.md, no CLEANUP.md, no /cleanup hand-off found.

Stack: Svelte 5 + Vite 6 + TypeScript static PWA on Cloudflare Pages, one Pages Function (TURN credentials), IndexedDB via idb, PeerJS WebRTC rooms. No SQL database - section 5 covers IndexedDB only. No priority hot paths were named by the user ("check everything").

## Budget violations

Budget violations: none (0 budgets checked) - no PERF.md exists, so no budgets are defined.

## Tooling

| Tool                                         | Status                                 | Used for                                                              |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| hyperfine                                    | missing                                | - (bench.ps1 used instead)                                            |
| C:\Users\Ido\.claude\scripts\bench.ps1       | found                                  | every timing below                                                    |
| node --cpu-prof                              | built-in (Node 24.18)                  | not needed: no long task found on the startup path                    |
| source-map-explorer / vite-bundle-visualizer | missing                                | replaced by bench/bundle-report.mjs (source-map decoder, zero deps)   |
| lighthouse                                   | missing                                | - (browser numbers came from the Performance API in the preview pane) |
| Chrome                                       | found (C:\Program Files\Google\Chrome) | headless Lighthouse once installed                                    |
| wrangler                                     | found                                  | not needed                                                            |

Install suggestions: `winget install sharkdp.hyperfine` (standing first suggestion); `npm i -g lighthouse` for throttled-mobile LCP / TBT numbers, which this audit could not produce.

Runtime floor: `node -e 0` median 139.6 ms, peak 41.6 MB. The product has no Node startup path (it is a web page), so the floor only frames the developer-tool numbers.

### Baseline (perf-baseline.json)

| Metric                                              | Median  | Peak MB | Note                                                           |
| --------------------------------------------------- | ------- | ------- | -------------------------------------------------------------- |
| test-suite (vitest, 25 files)                       | 2410 ms | 1073    | fine                                                           |
| build (vite build + PWA)                            | 4683 ms | 633     | fine                                                           |
| svelte-check                                        | 4504 ms | 636     | fine                                                           |
| bundle-js (dist/assets/*.js)                        | 485 KB  |         | main chunk 438 KB + 6 word-list chunks                         |
| main-js-gz                                          | 147 KB  |         | what a first visit downloads (brotli on Pages is ~10% smaller) |
| dist-total                                          | 706 KB  |         | fonts 137 KB, icons 34 KB                                      |
| clone-save-worst (structuredClone of a 2.4 MB game) | 1714 us |         | see "checked, found fine"                                      |

Browser (desktop, 12 cores, localhost preview, cold cache, service worker unregistered): DOMContentLoaded 21 ms, Home rendered, zero long tasks. Desktop startup is at the floor; the findings below are about bytes on a phone network, which this setup cannot time.

## Summary

| ID       | Location                      | Impact | Effort | Confidence | Risk    | Evidence | Status   |
| -------- | ----------------------------- | ------ | ------ | ---------- | ------- | -------- | -------- |
| PERF-001 | src/lib/p2p.ts:1              | High   | S      | High       | Safe    | M        | reported |
| PERF-002 | src/lib/qrscan.ts:1           | High   | S      | High       | Safe    | M        | reported |
| PERF-003 | public/_headers:5             | Medium | S      | High       | Safe    | M        | reported |
| PERF-004 | src/screens/NewGame.svelte:2  | Medium | S      | High       | Safe    | M        | reported |
| PERF-005 | vite.config.ts:31             | Low    | S      | High       | Safe    | M        | reported |
| PERF-006 | .github/workflows/ci.yml:16   | Low    | S      | Medium     | Safe    | M        | reported |
| PERF-007 | src/lib/validation.ts:244     | Medium | M      | Medium     | Careful | S        | reported |
| PERF-008 | src/screens/Home.svelte:19    | Low    | S      | Medium     | Safe    | S        | reported |
| PERF-009 | src/App.svelte:11             | Low    | M      | Medium     | Careful | M        | reported |
| PERF-010 | src/lib/i18n/index.ts:5       | Low    | M      | Medium     | Careful | M        | reported |
| PERF-011 | src/screens/Review.svelte:166 | Low    | M      | Medium     | Careful | S        | reported |

Sorted by Impact / Effort (High 3, Medium 2, Low 1 over S 1, M 2, L 4), ties by Confidence then path.

## Findings

### PERF-001 - PeerJS and its WebRTC shims load on the Home screen

- **Location**: src/lib/p2p.ts:1 (`import Peer from 'peerjs'`), pulled in by src/App.svelte:8, Home, NewGame, Round, Review, Join.
- **Problem**: The whole P2P stack (peerjs 29.0 KB, webrtc-adapter 38.3 KB, sdp 18.0 KB, peerjs-js-binarypack 8.8 KB = 94 KB raw, about 36 KB gzipped) is in the main chunk although solo and pass-and-play games never open a room.
- **Evidence**: Measured. bench/bundle-report.mjs on the source map: those four packages are 21.5% of the 438 KB main chunk. Gzip of the two largest files alone: peerjs bundler.mjs 18.2 KB, sdp.js 7.0 KB.
- **Repro**: `npx vite build --sourcemap --outDir <tmp>` then `node bench/bundle-report.mjs <tmp>/assets/index-*.js 30`. Before/after number: `node bench/main-gz.mjs` (147 KB now).
- **Impact**: High - roughly a quarter of the first-visit JavaScript on every phone, for a feature most sessions never use; the room-opening functions are already async so the load cost moves to the moment a room is opened or joined.
- **Effort**: S - `const { default: Peer } = await import('peerjs')` at the top of createRoom, reopenRoom and joinRoom; `Peer` stays a type-only import for buildHostRoom.
- **Confidence**: High.
- **Fix**: Dynamic-import peerjs inside the three async room functions so Vite emits it as its own chunk (also precached by the service worker, so offline behaviour is unchanged).
- **Risk of fix**: Safe.

### PERF-002 - jsQR (127 KB) is in the main chunk for an iOS-only fallback

- **Location**: src/lib/qrscan.ts:1 (`import jsQR from 'jsqr'`), used only in decodeWithCanvas at src/lib/qrscan.ts:66 when the native BarcodeDetector is missing.
- **Problem**: jsQR is the single largest module in the bundle and only runs when a guest opens the QR scanner on a browser without BarcodeDetector (iOS Safari). Every other user downloads and parses it for nothing.
- **Evidence**: Measured. bench/bundle-report.mjs: jsqr 127.4 KB = 29.1% of the main chunk. `gzip -c node_modules/jsqr/dist/jsQR.js | wc -c` = 57.7 KB, i.e. about 39% of the 147 KB gzipped main chunk.
- **Repro**: same as PERF-001; `node bench/main-gz.mjs` before/after.
- **Impact**: High - the biggest single byte win available, on the first-visit path.
- **Effort**: S - load it lazily inside startQrScan when `nativeDetector()` returns null (`const { default: jsQR } = await import('jsqr')`), before the interval starts.
- **Confidence**: High.
- **Fix**: Dynamic import of jsqr in the no-BarcodeDetector branch of startQrScan.
- **Risk of fix**: Safe - the scanner already awaits camera permission before the first tick, so the chunk load slots in there; a failed chunk load should reject startQrScan like a denied camera does.

### PERF-003 - Hashed assets are served with max-age=0 on production

- **Location**: public/_headers:5 (no rule for /assets/*).
- **Problem**: Cloudflare Pages' default header makes the browser revalidate every hashed asset (JS, CSS, fonts, word-list chunks) on each visit until the service worker takes over; the file names already carry a content hash and never change.
- **Evidence**: Measured. `curl -sI https://kategoria.pages.dev/assets/index-Dfly4HfG.js` returns `cache-control: public, max-age=0, must-revalidate` (with brotli encoding, so compression itself is fine).
- **Repro**: the curl line above; after the fix it should return `max-age=31536000, immutable`.
- **Impact**: Medium - one conditional request per asset per visit (10-15 round trips on a phone) for users whose service worker is not installed yet or was evicted; zero effect once the SW precache is active.
- **Effort**: S.
- **Fix**: Add to public/_headers: `/assets/*` with `Cache-Control: public, max-age=31536000, immutable` (index.html and sw.js must keep the revalidating default).
- **Risk of fix**: Safe - only files under /assets/ have hashed names.

### PERF-004 - qrcode generator loads for every visitor

- **Location**: src/screens/NewGame.svelte:2 (`import QRCode from 'qrcode'`), used in the lobby effect at line 148 only when a room code exists.
- **Problem**: 23.7 KB raw (about 8 KB gzipped) of QR encoder ships to every visitor although it renders only the host lobby of a phones-join game.
- **Evidence**: Measured. bench/bundle-report.mjs: qrcode 23.7 KB = 5.4% of the main chunk.
- **Repro**: same as PERF-001.
- **Impact**: Medium.
- **Effort**: S - `const { default: QRCode } = await import('qrcode')` inside the effect's async branch.
- **Confidence**: High.
- **Fix**: Dynamic import in the lobby QR effect.
- **Risk of fix**: Safe.

### PERF-005 - Service worker precaches all five Nunito subsets, including Vietnamese

- **Location**: vite.config.ts:31 (`globPatterns` includes woff2).
- **Problem**: On install the SW downloads 137 KB of fonts: latin 39 KB, latin-ext 36 KB, cyrillic 21 KB, cyrillic-ext 29 KB and vietnamese 13 KB. The app has no Vietnamese, and Nunito covers neither Hebrew nor Arabic, so at most two subsets are ever used per language. Page rendering is not affected (the CSS uses unicode-range, so the browser fetches only what it draws); this is install bandwidth only.
- **Evidence**: Measured. dist/sw.js precache manifest lists all five nunito-*.woff2 files.
- **Repro**: `Select-String -Path dist/sw.js -Pattern 'nunito-[a-z-]+' -AllMatches`.
- **Impact**: Low - 13 KB never needed (Vietnamese); up to 100 KB unneeded per device depending on language, but only once per install and without blocking anything.
- **Effort**: S.
- **Confidence**: High.
- **Fix**: `workbox.globIgnores: ['**/nunito-vietnamese-*']` now; optionally replace the package index.css with four hand-written @font-face rules so the unused subsets are not emitted at all.
- **Risk of fix**: Safe.

### PERF-006 - CI runs seven verification steps strictly in sequence

- **Location**: .github/workflows/ci.yml:16-25.
- **Problem**: format:check, lint, check, test, check:i18n, verify:design and build run one after another in a single job; locally they take about 2.4 s + 4.7 s + 4.5 s plus lint, so the job is dominated by npm ci and runner startup, but each step waits for the previous one.
- **Evidence**: Measured locally (baseline table); CI wall time itself was not measured.
- **Repro**: GitHub Actions run duration on the last commit vs after splitting.
- **Impact**: Low - developer-facing only.
- **Effort**: S - a matrix of the check scripts in parallel jobs sharing the npm cache.
- **Confidence**: Medium - runner startup may eat most of the win.
- **Fix**: Split into two or three parallel jobs (static checks / tests / build).
- **Risk of fix**: Safe.

### PERF-007 - Wikidata category checks run one at a time against a 2 s review deadline

- **Location**: src/lib/validation.ts:244 (`wikidataQueue`), consumed by Review.svelte:86 with CHECK_DEADLINE_MS = 2000.
- **Problem**: Each pending word needs a Wikidata entity search plus a SPARQL ASK, serialized through a single queue to respect WDQS throttling. With six players and eight categories that is up to 48 word checks of two requests each; anything not resolved in 2 s falls through to a manual group vote. Prefetch at submit time softens this, but only for words submitted early.
- **Evidence**: Suspected - pattern only. Live Wikidata is a third-party service and was not load-tested (audit rule).
- **Repro**: In a hybrid-validation game with 4+ players, count `vote` verdicts in Review's `verdicts` array (temporary console.log) against the pending count; instrument `inWikidataCategory` with `performance.now()` around the two fetches.
- **Impact**: Medium - user-facing: manual votes the app could have decided.
- **Effort**: M.
- **Confidence**: Medium.
- **Fix**: Batch the SPARQL step: collect the candidate ids of all pending words first (entity searches can run in parallel, they hit the regular API, not WDQS), then send one SELECT query with `VALUES ?item {...}` returning which ids match, so a whole review costs one WDQS request instead of N serial ones.
- **Risk of fix**: Careful - external rate limits; keep the cooldown and the per-word cache; verify semantics per word are unchanged.

### PERF-008 - Home screen loads every saved game to compute one boolean

- **Location**: src/screens/Home.svelte:19 (`listSaves()`), src/lib/db.ts:246 (`getAll` over the saves store).
- **Problem**: Each visit to Home deserializes every saved GameState (including base64 photo avatars, up to 400 KB per player) to decide whether to show the Resume button; Resume.svelte does the same to build its summaries.
- **Evidence**: Suspected - the number of saves on a family device is small, and a save is at most a few MB (bench/clone-save.mjs: 2.4 MB with six 400 KB avatars).
- **Repro**: In the browser console, time `await listSaves()` after seeding N saves with photo avatars; report median of 3.
- **Impact**: Low.
- **Effort**: S - iterate with a cursor over the `updatedAt` index and stop at the first unfinished local game, or keep a lightweight summary record; also delete finished saves.
- **Confidence**: Medium.
- **Fix**: Cursor-based `hasUnfinishedLocalSave()` in db.ts instead of loading full objects.
- **Risk of fix**: Safe.

### PERF-009 - All nine screens are imported eagerly

- **Location**: src/App.svelte:11-19.
- **Problem**: NewGame (16.7 KB), Round (13.2 KB), Join (12.2 KB), Review (10.0 KB) and the rest are all in the main chunk; a visitor sees Home first and needs one of them next.
- **Evidence**: Measured sizes (bundle-report); the win is Low once PERF-001/002/004 remove the libraries those screens drag in.
- **Repro**: bench/bundle-report.mjs.
- **Impact**: Low - about 60 KB raw / roughly 15 KB gzipped of app code.
- **Effort**: M - async component loading with a fallback in the screen switch.
- **Confidence**: Medium.
- **Fix**: Lazy-load Join and NewGame (largest, least universal) behind `{#await import(...)}`; leave the round/review/scoreboard trio eager.
- **Risk of fix**: Careful - offline precache still covers the chunks, but the screen switch gains a loading state.

### PERF-010 - Six UI language packs load eagerly

- **Location**: src/lib/i18n/index.ts:5-10.
- **Problem**: 40 KB raw of UI strings for all six languages ship to everyone; only one is active.
- **Evidence**: Measured (bundle-report: 6.2-7.0 KB each).
- **Repro**: bench/bundle-report.mjs.
- **Impact**: Low - about 10-12 KB gzipped.
- **Effort**: M - getPack is synchronous and used everywhere; lazy packs need an async language switch with English as the sync fallback.
- **Confidence**: Medium.
- **Fix**: Keep `en` static, load the other packs via `import.meta.glob` like the word lists.
- **Risk of fix**: Careful - a flash of English on first paint for non-English users unless the pack is awaited before mount.

### PERF-011 - Device vote polls connected voters every second

- **Location**: src/screens/Review.svelte:166 (`setInterval(..., VOTE_POLL_MS)`).
- **Problem**: While a word is on the phones for a vote, the host re-reads `connectedIds()` every second to shrink the quorum when a phone drops. The room already learns about drops through ping timestamps and connection close events; the poll exists because no event is exposed for "seat went stale".
- **Evidence**: Suspected - the work per tick is a Map scan over at most 8 seats; the cost is negligible, the pattern is what the audit flags.
- **Repro**: not worth measuring; would be `console.count` in settleDeviceVote during one vote.
- **Impact**: Low.
- **Effort**: M - expose an `onConnectedChange` callback from buildHostRoom driven by ping/close, fed by a single stale-check timer inside p2p.ts.
- **Confidence**: Medium.
- **Fix**: Event-driven quorum instead of polling; or leave as is.
- **Risk of fix**: Careful - vote settlement timing changes.

## Top 5 quick wins

| Rank | ID       | Win                                                                              |
| ---- | -------- | -------------------------------------------------------------------------------- |
| 1    | PERF-002 | about 58 KB gzipped off the first-visit JS (jsQR)                                |
| 2    | PERF-001 | about 36 KB gzipped off the first-visit JS (PeerJS stack)                        |
| 3    | PERF-004 | about 8 KB gzipped off the first-visit JS (qrcode)                               |
| 4    | PERF-003 | no revalidation round trip per asset on repeat visits before the SW is installed |
| 5    | PERF-005 | 13 KB less service-worker install download (Vietnamese subset)                   |

Estimated total if all five are applied: the gzipped main chunk drops from about 147 KB to about 45 KB (roughly two thirds less first-visit JavaScript), repeat visits stop revalidating hashed assets, and the SW install shrinks by 13 KB. Desktop timing will not move (already 21 ms to DOMContentLoaded); the win is on phones and slow networks, which this audit could not time - install Lighthouse to measure it.

## Checked, found fine

| Area                                                 | Last commit       | What was checked                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| updateGame clone + save path (src/lib/stores.ts)     | 390975f           | structuredClone of a full game: 429 us with emoji avatars (42 KB state), 668 us with 60 KB photo avatars, 1714 us worst case (six 400 KB avatars, 2.4 MB). Called on commit, settings and votes only - never per keystroke (answers are local $state in Round and Join). |
| Timers (Round, Join, Scoreboard, Review, qrscan)     | a5fa0d2           | All wall-clock based or 1 s cadence, all cleared on teardown; QR scan at 200 ms has a busy guard.                                                                                                                                                                        |
| Game logic (src/lib/game.ts)                         | dff71a6           | scoreRound and totalScores are O(players^2 x categories) with players <= 8 - not a finding.                                                                                                                                                                              |
| Word lists (src/lib/words, validation inBundledList) | a5fa0d2           | Per-language JSON chunks are lazy and cached; the includes() scan is over a few hundred words per category.                                                                                                                                                              |
| Caches in validation.ts                              | a5fa0d2           | wikidataCache, dictCache, factCache, learnedCache are unbounded but keyed by words played this session - bounded in practice; dictCache evicts errors.                                                                                                                   |
| P2P messages (src/lib/p2p.ts)                        | a5fa0d2           | Typed deltas (round, vote, results, scores), never the full GameState; 4 s guest heartbeat; reconnects retry with 2 s backoff, no polling. TURN credentials cached per page load for 90 min.                                                                             |
| Listeners / subscriptions                            | a5fa0d2           | popstate removed on unmount; onGuestMessage returns an unsubscribe; soundOn.subscribe is a module singleton by design.                                                                                                                                                   |
| IndexedDB (src/lib/db.ts)                            | 736b8b5           | One connection promise reused; learned-word writes in one transaction; profiles touched once per game start.                                                                                                                                                             |
| Pages Function (functions/turn-credentials.ts)       | cd07434           | Two upstream calls are inherently sequential (Turnstile verdict gates the mint); both have 8 s timeouts; response is no-store by design.                                                                                                                                 |
| Fonts at runtime (src/main.ts)                       | 3415020           | unicode-range subsets - the browser fetches only the subsets it draws.                                                                                                                                                                                                   |
| Sound (src/lib/sound.ts)                             | 390975f           | One oscillator per tick for the last 10 s; AudioContext created once.                                                                                                                                                                                                    |
| Tests / build / check                                | d3b5049 / 3415020 | 2.4 s / 4.7 s / 4.5 s. Vitest peak 1.07 GB is the default 12-worker pool on this machine, not a leak.                                                                                                                                                                    |
| Third-party scripts                                  | cd07434           | Turnstile loads only when a room is opened; nothing blocks first render.                                                                                                                                                                                                 |

Sections not covered by this mode: none (full audit). Section 5 (database) reduced to IndexedDB - there is no SQL store.

## Cleanup hand-off

No dead code found during this audit; nothing appended to .cleanup-state.md.
