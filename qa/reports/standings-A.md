# QA Playtest Report — standings-A

Tester persona: naive min-maxer QA (counts points, watches the clock).
Origin under test: http://localhost:5182/ (tab-10)
Date: 2026-09-09

## Process note (not a product bug)

Early in the session, one `browser_batch` call omitted `tabId` on its inner actions. The batch executed against the currently-fronted tab, which turned out to be **tab-8** (origin `http://127.0.0.1:5182`, apparently another agent's session), not my own tab-10. Effect: "🤖 Add robot" was clicked 4 times on tab-8 before I caught it (confirmed via `tabs_context`). I did not touch tab-8 again afterward and completed the rest of the test exclusively on tab-10, passing `tabId` explicitly on every subsequent action (including every item inside `browser_batch`). Flagging this since it may have added 4 unexpected robots to another tester's game — worth telling that tester/owner if cross-checking their results.

## Setup used

New Game → One shared screen → players: Ivy, Jon (humans) + 5 robots (Robo, Robo 2‑5) = 7 players → Next → step "How do you want to play?" (new intermediate screen — not mentioned in the script; picked "All categories, one letter", the default) → step "Pick categories": app defaulted to 5 favorites (Animal, Food, City, Name, Thing — confirmed via `aria-pressed`); deselected City, Name, Thing, leaving **Animal + Food** → Next → Points & timer: left "Unique words win big" (default), selected **No timer**, set **Rounds = 2**, expanded Advanced → Start!.

Two full games were played (4 rounds total) to get clean, low-noise timing data (see F6).

---

## F4 — "after each round, show best 5 player points in that game"

**Steps:** After each of 4 rounds (2 games × 2 rounds), read the "🏆 Standings" block on the review screen and independently summed each player's per-category points from the same screen to verify against the displayed ranking.

**Observations (all 4 rounds, verbatim standings text + my computed totals):**

- Round 1, Game 1 (7 players): displayed `Jon 18 / Ivy 15 / Robo 3 11 / Robo 4 11 / Robo 5 11`. My tally from the per-word scores on the same screen: Jon 18, Ivy 15, Robo3 11, Robo4 11, Robo5 11, Robo2 8, Robo 3 → top-5 matches exactly, correctly excludes Robo2 (8) and Robo (3).
- Round 2, Game 1 (final round, shows "See scores" instead of "Next round"): displayed `Robo 4 27 / Robo 2 19 / Jon 18 / Ivy 15 / Robo 3 14`. My tally: Robo4 27, Robo2 19, Jon 18, Ivy 15, Robo3 14, Robo5 11, Robo 9 → top-5 matches exactly.
- Round 1, Game 2 ("Play again", same 7 players, ordinary words): displayed `Ivy 10 / Jon 8 / Robo 2 6 / Robo 3 6 / Robo 4 6`. My tally: Ivy 10, Jon 8, Robo2 6, Robo3 6, Robo4 6, Robo5 6, Robo 3 → top-5 matches (tie at 6 broken consistently, no duplicate/missing rows).
- Round 2, Game 2 (made-up words, final round): displayed `Robo 3 22 / Robo 5 22 / Robo 11 / Ivy 10 / Jon 8`. My tally: Robo3 22, Robo5 22, Robo 11, Ivy 10, Jon 8, Robo2 6, Robo4 6 → top-5 matches, ties at 22 both shown.

In every case exactly **5 rows** were shown out of 7 players, sorted descending by cumulative total-so-far, and the math checked out with no off-by-one or stale-data errors. The separate end-of-game "Scores" screen (via "See scores") correctly shows **all 7** players (verified twice), so the 5-row cap is specific to the per-round review screen as specified.

**Verdict: PASS.** No bugs found. Minor UX note: ties (e.g. two players both at 22, both crowned "🤖 Robo 3 & Robo 5 wins! 🎉" on the final scoreboard) are handled sensibly with dual-crown 👑 icons.

---

## F5 — "points speed feature will be automatically enabled"

**Steps:** On step 3 ("Points & timer"), before touching anything, inspected the "Advanced" section (collapsed by default — its content is present in the DOM/accessibility tree but not in the rendered/visible text until expanded, confirmed via `get_page_text` before vs. after clicking "Advanced"). Then expanded it and read the "⚡ Speed bonus" chip.

**Observation:** The chip renders as **"✓ ⚡ Speed bonus"** — checked — immediately on a fresh New Game flow, before any user interaction with that chip. Confirmed twice (once per game setup in this session).

**Behavioral evidence (round 1, ordinary words, letter W):** Ivy answered immediately; Jon was made to wait ~10s before answering.

- Animal: Ivy "Wolf" → **Unique! · 10**; Jon "Walrus" → **Unique! · 9** (both unique words, but Jon — slower — scored one point less).
- Food: Jon "Watermelon" → **Unique! · 9** (again 9, not the full 10, consistent with a speed penalty for the ~10s delay). Robots (slowest, sequential auto-play) scored **8** for unique words in the same round, and **3** for duplicate ("same word") categories vs. Ivy's **5** for a duplicate — i.e. the fastest player (Ivy) gets full base points (10 / 5) and slower players get progressively less, exactly matching "faster finishers keep more points."

**Verdict: PASS.** Default-on state confirmed, and the scoring behavior is consistent with an active speed bonus (Ivy ≥ Jon ≥ robots for otherwise-equal words). No bugs found here. UX note: the "Advanced" section's DOM content is queryable via accessibility tree even while visually collapsed — harmless, but something to be aware of if any test tooling asserts on DOM presence rather than visible text/CSS state.

---

## F6 — "word checking took more than 2 seconds each time the round closed, cap it at 2 seconds"

**Method:** My first two timing attempts used `Date.now()` reads via separate `javascript_tool` calls bracketing each transition, but a control measurement (timing a trivial "See scores" click with zero checking involved) showed **~8.3s of pure tool/round-trip overhead** for a 3-call sequence in this environment — meaning wall-clock deltas across separate MCP tool calls are too noisy to judge a 2-second budget. I switched to a more reliable method: chaining the trigger action and a **precise in-browser `wait`** (2s, executed inside the browser, not subject to my tool round-trip) plus `get_page_text` inside a **single `browser_batch` call**, and polled in fixed 2s increments to bracket when text changed.

**Clean run 1 — ordinary words (Game 2, Round 1, letter J):** Jon (last human) clicks Done →

- t=0s (same batch as the click): "🤖 Robo is thinking…"
- t=+2s: "🤖 Robo 4 is thinking…" (Robo, Robo 2, Robo 3 had already finished)
- t=+4s: full results + standings already rendered (all 14 words scored, checking done, "Let's check the words!" screen fully resolved).

So total elapsed from last human's Done to fully-checked results ≈ 4s, of which the checking step itself (once the last robot's turn ended, somewhere in the 2–4s window) resolved within that same ≤2s window, not on top of it.

**Clean run 2 — made-up words forcing online/dictionary checks (Game 2, Round 2, letter T; words "Trombulon", "Trizzlefudge", "Twombuckle", "Trazzlepop"):**

- t=0s: "Robo is thinking…"
- t=+2s: "Robo 4 is thinking…"
- t=+4s: already at the first vote question — **"Let's check the words! 🤔 Is "Trombulon" a real animal?"**
- Answering that vote question (👎 No) → next question ("Trizzlefudge") appeared with **no additional wait needed** (same batch call, instantaneous).
- Same for the 3rd ("Twombuckle") and 4th ("Trazzlepop") questions — each transition was instantaneous within a single batched click+read.
- After the 4th answer → full results + standings rendered instantly.

**Verdict: PASS**, with a caveat. The word-checking step itself (including the online-dictionary path for nonsense words) resolves in well under 2 seconds once the last player (robot included) finishes their turn — in both runs it was effectively instantaneous once robots stopped "thinking." The dominant contributor to the _total_ elapsed time between the last **human's** Done tap and final results (~4s+ observed) is the **sequential robot auto-play animation** ("Robo N is thinking…" for each of 5 bots in turn), not the word-checking API/logic. If the product owner's original complaint ("word checking took more than 2 seconds") was measured from the last _human_ action rather than the last _player_ (bot-inclusive) action, that gap is dominated by bot turn-taking pacing, not checking — worth clarifying with the product owner whether "round closes" should be timed from last human input or last player (bot) input, since the fix target differs (bot pacing vs. checking pipeline).

**Confidence caveat:** All timings above bucket in 2-second increments (limited by my polling granularity) — I can say each transition was ≤2s, but cannot rule out e.g. 1.9s vs 0.1s within a bucket. Given every bucket showed the transition already complete, I'm reasonably confident the true checking latency is low (likely under 1s), but recommend the dev team add an internal timestamp/log (e.g. `performance.now()` around the check-words call) for byte-exact verification if the 2-second SLA needs to be certified precisely.

---

## Other observations / minor bugs (not blocking F4–F6)

1. **Letter-mismatch words are silently accepted, not flagged client-side.** Entering "Blorptix" for the Animal category on a round whose letter was "T" was accepted with no warning, then correctly resolved to a vote question ("Is 'Blorptix' a real animal?") and ultimately "Not counted · 0" after voting No. Not a bug per se (the checking step is the actual gatekeeper), but there's no earlier UX signal telling the player their word doesn't even start with the right letter — a minor UX gap.
2. **Robots sometimes submit no answer** for a category (rendered as "—", scored 0) — appears to be intentional randomness in bot behavior, not a crash or error, but slightly odd that different bots skip different categories inconsistently round to round. Flagging only as a UX/fairness observation, not a defect.
3. **Duplicate-word detection is case-insensitive and works across bots and humans** — e.g. Ivy's "Waffle" and Robo 5's "waffle" both correctly counted as "Same word." Confirmed working correctly.
4. **Bonus check — category memory (as requested):** Confirmed **PASS**. After finishing the two games and returning Home → New Game, step 2 ("Pick categories") had **only Animal and Food pre-selected** (verified via `aria-pressed`), and the "We picked five favorites — tap to change them!" hint text was **absent** this time (it only shows for the default 5-favorite fallback) — i.e., the app correctly remembered the last-used category set instead of resetting to defaults.
5. **Console errors:** `read_console_messages(onlyErrors: true)` returned **no console logs at all** — not even the expected dev-mode 404 for `/turn-credentials` (likely because this pass-and-play flow never touches the TURN/P2P code path). No unexpected errors observed.
6. **Unscripted intermediate step:** Between "Who is playing?" and "Pick categories" there's a "How do you want to play?" screen (All categories/one letter vs. One category/one letter) not mentioned in the test script — used the default ("All categories, one letter") throughout. Worth the product owner confirming this is intended/expected in the flow.

## Summary table

| Feature                     | Verdict                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4 (best-5 standings)       | PASS — verified correct in 4/4 rounds across 2 games, ties handled correctly, full 7-player list correctly shown on end-of-game scoreboard                                                                                                                                                                  |
| F5 (speed bonus default-on) | PASS — chip is ✓ by default pre-interaction; scoring behavior consistent with an active speed penalty for slower answers                                                                                                                                                                                    |
| F6 (checking ≤ 2s)          | PASS (with caveat) — checking/vote-flow itself resolves within ~2s of the last player's turn ending, in both ordinary-word and forced-online-check scenarios; total perceived delay is mostly robot auto-play pacing, not checking logic; recommend precise in-app instrumentation to certify the exact SLA |
