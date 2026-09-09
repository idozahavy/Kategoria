# QA Playtest Report — prefs-A

Origin under test: http://localhost:5180/
Tester: naive-QA persona (careful completionist)
Date: 2026-09-09

## Summary

- F1 (persist selected + custom categories): **PASS**
- F2 (auto-add typed-but-not-added category on Next): **PASS**
- F5 (speed bonus enabled by default): **PASS**

---

## F1 — Persist selected categories + custom categories

**Steps taken:**

1. New Game → players renamed to "Mia" and "Noa" (see Notes on player-editing UX bug below) → Next.
2. In step 2 ("How do you want to play?" / "Pick categories"), default selection was 5 chips: Animal, Food, City, Name, Thing (confirmed via `aria-pressed="true"` on the chip buttons).
3. Deselected Animal and Food; selected Sport and Color. Selection became: City, Name, Thing, Sport, Color.
4. Typed "Superheroes" in the "Add your own" box and pressed the **"Add your own" button** → chip "Superheroes" appeared, auto-selected (`aria-pressed=true`).
5. Typed "Pokemon" in the same box and pressed **Next** (deliberately without pressing "Add your own") — see F2 section for what happened here.
6. Completed step 3 (Advanced expanded, "No timer" chosen, Start!).
7. Played one full round with both players answering all 7 categories (City, Name, Thing, Sport, Color, Superheroes, Pokemon), confirmed via review screen all 7 categories appeared with words and points (see F5 section for the review screen dump).
8. Ended the game ("See scores" → "End the game" → "Home").
9. New Game again → Next (step1) → step 2: exact same selection was preselected — verified via JS: `["City","Name","Thing","Sport","Color","Superheroes","Pokemon"]` all `aria-pressed=true`. Custom chips "Superheroes ✕" and "Pokemon ✕" both present in the DOM.
10. Navigated the tab to `http://localhost:5180/` (full reload, fresh document — this clears any in-memory JS state, only storage-backed state survives). New Game → Next → step 2: **same 7-category selection persisted**, confirmed again via `aria-pressed` query returning the identical 7-item list.

**Storage evidence (read-only inspection via `javascript_tool`, no source files touched):**

- `localStorage["categories-setup-categories"]` and `localStorage["categories-active-game"]` (a UUID pointer) exist.
- `indexedDB.open('kategoria')` exposes object stores `learned`, `profiles`, `saves`. The `saves` store held the full active-game document (settings, categories incl. the two custom ones with generated UUIDs, players, rounds, per-answer points, per-player `finishTimes`), confirming categories (including custom ones) are durably persisted in IndexedDB, not just page memory.

**Edge case — removing a custom category persists too:**

- Went back into step 2, removed "Superheroes" via its "Remove" (✕) button — page text confirmed only "Pokemon ✕" remained.
- Proceeded through step 3, clicked **Start!**, then used the round's **Back arrow** → confirmed the "Leave this round? Your progress is saved." dialog → OK → Home.
- New Game → Next → step 2: **"Superheroes" was permanently gone**, only "Pokemon ✕" remained selected. Removal survives past a game start + leave.

**Verdict: PASS.** Category selection and custom categories (both additions and removals) persist across: leaving/starting a new game in the same session, and across a full page reload (IndexedDB-backed, not just sessionStorage/in-memory).

**Note (not a bug, but worth flagging):** Only the _category_ selection persisted this way. The Points/Timer choice from step 3 (I picked "No timer") did **not** carry over into the next game — the second game I started showed a live timer ("1:59") even though I had selected "No timer" the first time and never re-visited step 3's timer chips for the second game. This is consistent with the product owner's F1 wording (which only mentions categories), so not filed as a bug, just a UX-expectation note: a user might reasonably expect _all_ their prior game setup (not just categories) to be remembered.

---

## F2 — Auto-add a typed-but-not-confirmed category on "Next"

**Steps taken:**

1. In step 2, typed "Pokemon" into the "Add your own" text box.
2. Did **not** click the "Add your own" button.
3. Clicked **Next** directly.
4. Went **Back** to step 2 to inspect the result.

**Observation:** The category list now showed "Pokemon ✕" as a new custom chip, and it was selected (`aria-pressed="true"`), exactly as if the Add button had been pressed. Text box was cleared. Wizard advanced to step 3 normally (no error, no blocking).

Confirmed again later in the review screen after playing the round — "📝 Pokemon" appeared as a full category with both players' words and per-word points, proving the auto-added category was wired into the actual game, not just cosmetically added to the chip list.

**Edge cases tested around F2:**

- **Empty text box + Next:** Left the box empty and pressed Next — no extra/blank category was created (list stayed at "Superheroes ✕", "Pokemon ✕"). Correct behavior.
- **Duplicate name:** Typed "Pokemon" again (identical to the existing custom category) and pressed the **Add your own button** this time — no second "Pokemon" chip was created; the list still showed exactly one "Pokemon ✕". Correct de-duplication, no crash, no error message.
- **Very long name (41 chars):** Typed "Very Long Category Name For Testing Limit" (41 chars) and pressed **Next**. The app did **not** silently add it and did **not** advance to step 3. Instead it showed inline text: **"That name is too long — try a shorter one!"** and kept the user on step 2. This is a sensible guard, though it is a partial exception to the literal F2 instruction ("always add ... if written to input and user presses the button to continue") — for an overlong name, the app blocks progress entirely rather than adding it. Flagging as a spec ambiguity/edge case for the product owner rather than a bug: the behavior (reject clearly, don't silently drop) seems like the right call, but it does mean "continue to game" is blocked until the user fixes or clears the text, which could confuse a young player who doesn't understand why "Next" isn't working.

**Verdict: PASS.** The core F2 behavior (typed-but-unconfirmed category is auto-added and auto-selected when the user presses Next) works correctly and reliably across multiple triggers of the flow. Empty-input and duplicate-input edge cases are handled correctly (no spurious categories). Overlong-input edge case blocks navigation with a clear message rather than adding a bad category — reasonable, but worth a product decision on whether "block" or "truncate-and-add" is the intended behavior for that edge case.

---

## F5 — Speed bonus enabled by default

**Steps taken:**

1. In step 3 ("Points & timer") of a brand-new game, clicked the collapsed **"Advanced"** summary to expand it (never touched it in any prior session).
2. Read the expanded content.

**Observation (verbatim):**

```
Online extras
✓ Online category check
✓ Fun word facts
Faster finishers keep more points
✓ ⚡ Speed bonus
```

The "✓ ⚡ Speed bonus" chip showed a checkmark (`aria-pressed="true"` confirmed via JS) without any manual interaction — i.e., it is ON by default for a new game, as specified.

**Functional verification (not just the toggle state):**
Played a full round: category letter "P", 7 categories. Mia went first and answered quickly (fewer real-world seconds between "OK" tap and "Done!"); Noa went second. Review screen showed, for every one of the 7 categories, Mia's unique word scored **9 points** and Noa's unique word scored **10 points** (word-checking mode "unique word = 10 base, minus speed adjustment").

At first this looked backwards (Mia went first / "faster" by turn order, but scored _fewer_ points than Noa). To resolve this I inspected the saved game state directly (read-only, via `indexedDB` on the `kategoria` database, `saves` store — the same object store the app itself reads/writes, no source files touched):

```
"finishTimes":{"<Mia's playerId>":55801,"<Noa's playerId>":28542}
```

This shows the app measures **per-player time actually spent on their own turn** (turnStart → Done), not "who went first" in turn order. In this run, Mia's turn took 55.8s of real wall-clock time (my tool round-trips were slower while filling her answers) while Noa's turn took only 28.5s. So Noa was the genuinely _faster_ player this round, and she correctly received the higher per-word score (10 vs 9). This confirms the speed-bonus mechanic is functioning correctly end-to-end (toggle default → actual scoring effect), not just cosmetically checked.

**UX gap worth flagging:** nothing in the round or review UI surfaces a player's own elapsed time/speed rank while playing or on the review screen (points differences are shown, but not _why_ — e.g. no "you were faster/slower" indicator). A curious kid (or QA tester!) has no on-screen way to tell that speed, not turn order, drives the bonus — this is exactly what led to my own initial (incorrect) assumption above. Consider a small "⚡ fastest this round" badge or an elapsed-time readout to make the mechanic legible without dev tools.

**Verdict: PASS.** Speed bonus is ON by default for a new game (checkmark visible pre-toggle), and it demonstrably affects scoring in the expected direction (less time on your turn → more points for your unique words).

---

## Other bugs / oddities observed (not tied to a single F-number)

1. **Player-name editing glitch in Step 1 "Who is playing?" (moderate confidence, may be a test-timing artifact rather than a genuine app bug):** Clicking an existing player chip (e.g. "Ana") correctly turns it into an editable text field. However, immediately after typing a new name into that field and then clicking on what had been a _different_ player's chip position, the click sometimes landed on "Add player" instead and created a stray new player with a default name ("Ana") rather than editing the intended chip — likely because the row order/position shifts on re-render right after typing, and a stale click coordinate lands on the wrong control. I had to detect and delete the stray entry via its "Remove" (✕) button. Recommend the dev/QA team verify this isn't reproducible with real mouse/touch input (vs. my batched coordinate clicks), but if it is, it's a real risk for kids tapping quickly through this screen. Repro sketch: click chip "Ana" → type a new name → immediately click at the on-screen position of the "Ben" chip without waiting for re-render → observe whether a spurious new player appears instead of Ben becoming editable.

2. **Grammar bug in the word-vote prompt:** For the custom category "Superheroes" (plural name), the vote question read: **"Is 'Professor X' a real superheroes?"** — grammatically should be "a real superhero" (singular). Repro: create a custom category with a plural name (e.g. "Superheroes"), get a word for it that triggers the "is this real?" vote, and read the question text. Low severity (cosmetic/i18n), but visible to end users including kids learning language.

3. **Layout/scroll oddity during a round:** After several inputs were filled in a category list (e.g. scrolling toward the "Sport" input), a screenshot showed a large blank/empty area above the round-letter badge, with the letter badge sitting far down the page rather than near the top. Not confirmed as a functional bug (didn't block input), but visually looked like excess reserved space, possibly a mobile-keyboard-avoidance scroll behavior leaking into the desktop layout. Worth a visual check by the dev team on a real device/browser.

4. **Step 3 "Points" section inconsistently shown:** On the very first pass through the wizard, step 3 displayed a "Points" section with two mode options ("Unique words win big" / "Every good word counts") above the Timer section. On a later pass (second New Game in the same session) step 3 went straight from the heading to "Timer" without showing the Points mode chips at all. Not fully investigated (out of scope for F1/F2/F5), but flagging as a possible rendering inconsistency worth a second look.

5. **No console errors at all** during the entire session (`read_console_messages` with `onlyErrors: true` returned "No console logs." at the end of testing) — including no `/turn-credentials` 404, which simply never fired since this was a local pass-and-play game with no remote/TURN connection attempted.

6. **Pre-existing players on a fresh tab:** The very first "Who is playing?" screen already had two players "Ana" and "Ben" pre-filled (not the app's own default empty state) — this is almost certainly leftover state in the shared dev server / origin from earlier testing (not something I did), not a bug, but noting it so results aren't misread as the app inventing default players.

---

## Budget

Used roughly 65 browser actions (slightly over the ~60 suggested budget) due to extra investigation needed to correctly interpret the F5 speed-bonus result (had to cross-check IndexedDB finishTimes to avoid reporting a false bug) and to clean up a UI hiccup during player-name entry. No blockers encountered — every planned scenario and edge case was completed.
