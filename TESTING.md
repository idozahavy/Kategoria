# Testing policy

Starter written by `/test-gaps` on 2026-09-04, must-cover extended 2026-09-10. Edit freely; `/test-gaps` reads it on every run.
`docs/project/CONVENTIONS.md` (when it exists) wins on framework, layout and naming.

## Must cover

Areas that would hurt most if they silently broke (from the opening question):

- `src/lib/game.ts` - scoring, round advance, finish detection, letter drawing
- `src/lib/p2p.ts` - host rooms, guest joins, untrusted message guards, seat reclaim
- `src/screens/Round.svelte` - round timer and time-up handling ("game timeouts")
- `src/screens/Join.svelte` - guest waiting for the host to proceed
- `src/screens/Scoreboard.svelte` - auto-continue countdown between remote rounds
- `src/lib/vote.ts` - phone group-vote tally (added 2026-09-10)
- `src/screens/Review.svelte` - ballot orchestration for the device vote (added 2026-09-10)
- `src/lib/turnstile.ts` - Turnstile token round-trip before TURN minting (added 2026-09-10)
- `functions/turn-credentials.ts` - same-origin / bot-check rules of the TURN endpoint (added 2026-09-10)
- `src/lib/qrscan.ts` - camera open, detector polling, room code from the scanned URL (added 2026-09-10)

## Never test

- `src/lib/i18n/{ar,en,es,fr,he,ru}.ts` - language pack data
- `src/lib/words/*.json` - bundled word lists
- `src/main.ts`, `src/vite-env.d.ts` - bootstrap wiring
- `design/`, `dist/`, `qa/` - design assets, build output, playtest notes

## Coverage floors

Line coverage per path that `/test-gaps check` treats as a regression when crossed.
Floors are today's value rounded down to a multiple of 5, so a check never accepts less than now.

- `src/lib/game.ts: 95`
- `src/lib/p2p.ts: 95`
- `src/lib/vote.ts: 100`
- `src/lib/turnstile.ts: 75`
- `functions/turn-credentials.ts: 100`
- `src/lib/qrscan.ts: 50`
- `src/screens/Round.svelte: 0`
- `src/screens/Join.svelte: 0`
- `src/screens/Scoreboard.svelte: 0`
- `src/screens/Review.svelte: 0`
- default: 80

## Settings

- `coverage_threshold_pts: 2` - total line/branch % drop that counts as REGRESSED
- `file_drop_pts: 5` - per-file line % drop that is listed by `check`
- `time_threshold_pct: 10` - suite wall-time growth that counts as REGRESSED
- `quarantine_days: 30` - how long a flaky test may stay skipped before it must be resolved
