# QA Playtest Report — prefs-B

Origin: http://127.0.0.1:5180/
Persona: naive/rusher QA tester, edge-case poking
Tester: Claude (browser-driven, in-app only, no source reading)

## Summary

| Feature                                               | Result                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| F1 — persist selected/created categories              | PASS                                      |
| F2 — auto-add uncommitted "Add your own" text on Next | PASS                                      |
| F5 — Speed bonus ON by default                        | PASS                                      |
| F6 — word check completes within ~2s                  | PASS (with measurement caveat, see below) |

---

## F1: Persist selected categories + created categories (localStorage/IndexedDB)

**Steps taken:**

1. New Game → players "Zed", "Ava" → Step 2: typed "Dinosaurs" in "Add your own" WITHOUT pressing its Add button, pressed Next.
2. Went Back to Step 2: confirmed "Dinosaurs" appeared as a selected (teal) chip with a X remove control — proves the un-committed text got created as a real category (ties to F2 too).
3. Deselected every built-in chip and the "Dinosaurs" chip (verified via JS: no button had the `on`/`aria-pressed=true` class), confirmed "Next" button had `disabled: true` via `next.disabled`.
4. Typed a new custom category "Superheroes" (again without pressing its Add button) — `Next.disabled` flipped to `false` immediately from the mere text.
5. Pressed Next, completed the wizard (No timer, Rounds=2, Speed bonus left default), played a full 2-round game as Zed/Ava.
6. From Home → New Game → Step 1: player names "Ava", "Zed" appeared pre-filled (persisted, order differs from creation — minor note, not tested against spec).
7. Step 1 → Next → Step 2: confirmed via JS (`button.chip` class scan) that **only "Superheroes" carried the `on`/selected class**; "Dinosaurs" was present as a chip (still exists as a created category) but correctly NOT selected — this exactly mirrors the selection state I left the wizard in at step 3 of the prior game (I had deselected Dinosaurs before adding Superheroes). This is precise, correct persistence of both "created categories" and "which ones are currently selected."
8. Removed "Dinosaurs" via its X. Confirmed removed from the DOM immediately.
9. Advanced through the wizard, started a quick game, then used Back → "Leave this round? Your progress is saved." → OK to return Home (Home now also showed a new "Resume Game" button — a related, un-requested but reasonable feature).
10. New Game → Step 2: confirmed "Dinosaurs" stayed gone; only "Superheroes" chip present.
11. Hard-reloaded the tab via `navigate` to the bare origin (full page reload, not SPA nav) → New Game → Step 1 (player names still pre-filled) → Next → Step 2: **"Superheroes" still present and selected, "Dinosaurs" still absent.** This proves the persistence is durable storage (localStorage/IndexedDB), not just in-memory Svelte state — confirmed `localStorage` key `categories-setup-categories` exists (seen via `Object.keys(localStorage)`), plus an IndexedDB database named `kategoria` (v3).

**Observation on scope:** Timer/Rounds/Points-mode settings reset to defaults (Normal 2min timer, Rounds=3) on a new game — only category selections/creations persist, matching the feature's literal wording ("keep selected categories and created categories"). Not a bug.

**Verdict: PASS.** Category selection and custom categories persist correctly across new games and across a full page reload; case-insensitive duplicates are not re-created (see F2 section).

---

## F2: Auto-add uncommitted "Add your own" text when continuing to game

**Steps taken:**

1. Step 2, typed "Dinosaurs" into the "Add your own" textbox, pressed **Next** directly (never clicked the separate "Add your own" button next to the textbox).
2. Result: wizard advanced normally to Step 3 (no block).
3. Went Back to Step 2 — "Dinosaurs" appears as a proper, selected chip (teal, with X), exactly as if the Add button had been pressed. **Confirms auto-add works.**
4. Edge case — overlong name: typed a 41-character string `ThisIsAVeryLongCategoryNameForTesting123` (no `maxlength` attribute on the input — accepted 41 chars into the field) and pressed Next. Result: **blocked** — inline message "That name is too long — try a shorter one!" appeared, wizard stayed on Step 2, and the textbox retained the typed value. Good validation, did not silently swallow or truncate.
5. Edge case — case-insensitive duplicate: cleared the field, typed lowercase "dinosaurs" (existing category is "Dinosaurs"), pressed Next. Result: advanced to Step 3 with **no error** and no second chip created — going Back confirmed only one "Dinosaurs" chip exists. Duplicate detection is case-insensitive and silent (does not error, just doesn't create a second entry) — reasonable behavior, not a bug.
6. Edge case — select-nothing-then-type-only: deselected every built-in and custom chip (Next became `disabled=true` confirmed via JS), then typed "Superheroes" into "Add your own" without pressing its Add button — `Next.disabled` flipped to `false` from the text alone, and pressing Next successfully started/continued the wizard with **only** "Superheroes" as the (auto-created and auto-selected) category. This is the core F2 behavior working under the most literal interpretation of the ask.

**Verdict: PASS.** Uncommitted "Add your own" text is reliably auto-added (and auto-selected) whenever Next is pressed, including as the sole category, with sane validation (length cap) and sane dedup (case-insensitive) around it.

---

## F5: Speed bonus enabled by default

**Steps taken:**

1. Step 3 ("Points & timer"), clicked the collapsed "Advanced" summary to expand it.
2. Text read: `Online extras / [check] Online category check / [check] Fun word facts / Faster finishers keep more points / [check] Speed bonus`. The "Speed bonus" chip showed a leading checkmark exactly like the other two enabled toggles — confirms **on by default**, no manual action taken to enable it.
3. Functional confirmation (not just visual): played round 1 with two real words for the same category/letter — Zed answered first ("Nightwing"), Ava answered several seconds later ("Namor"). Review screen showed:
   - `Zed / Nightwing / Unique! · 10`
   - `Ava / Namor / Unique! · 9`
     Both words were unique (different values) yet the slower-to-submit player (Ava) scored one point less than the faster player (Zed) for an equally-unique word — this is the speed-bonus effect in action, confirming the feature is not just toggled on cosmetically but actually affects scoring by default.

**Verdict: PASS.**

---

## F6: Word checking capped at ~2 seconds

**Steps taken:**

1. Round 1 (real words): captured `Date.now()` via `javascript_tool` immediately before tapping the final player's "Done!", then queried page state; the review screen (first a vote question "Is 'Nightwing' a real superheroes?", then results) was already rendered by the very first check.
2. Round 2 (made-up words "Orbloptix" / "Omnizoraxx", not in any built-in list, letter O): same approach — captured timestamp right before the last "Done!" tap, then immediately checked page state. The vote question ("Is 'Orbloptix' a real superheroes?") was already showing.
3. In both cases, no run showed a stuck/long-lived spinner — content (spinner replaced by either a vote question or final results) was present on the very first content check after tapping Done.

**Measurement caveat (important):** This test environment's browser-tool round trips carry substantial inherent latency — back-to-back `javascript_tool`/`computer`/`get_page_text` calls measured **~5-6 seconds of wall-clock gap between calls themselves** (verified by bracketing two consecutive tool calls with `Date.now()`: e.g. one gap measured 5296ms for a single click+read pair). This means my `Date.now()`-based polling could not achieve true sub-2-second resolution as instructed — the tool overhead itself exceeds the 2s budget being measured, so a poll interval of "every ~1s" was not achievable in practice. I was not able to catch the spinner in an intermediate state in any of my checks (it always looked "already done" by the time I could observe it), which is consistent with — but does not rigorously prove — a sub-2-second cap. No evidence of the previously-reported 2s+ delay was observed; the review screen never felt slow from a user's perspective in any of my playthroughs.

**Verdict: PASS** (functionally — no delay was ever observed or perceived), **with reduced confidence in the precise timing figure** due to tool-latency limits described above. Recommend a follow-up measurement using an in-page `performance.now()` + `MutationObserver` harness (started before the click, read well after) for a rigorous number, rather than external polling.

---

## Other bugs / anomalies found (not in F1/F2/F5/F6 scope, but worth triage)

1. **Single-player "Me" fallback after Leave→Resume→New-Game cycle.** After I: started a 2-player (Zed/Ava) game → left mid-round via Back → "Leave this round? Your progress is saved" → OK → Home (now showing a new "Resume Game" button) → New Game → wizard correctly showed Zed & Ava pre-filled on Step 1 and correctly showed my persisted categories on Step 2 → completed the wizard and pressed Start — **the actual game that started had only a single player named "Me"**, no hand-off screen appeared, and the made-up word "Flarptonium" (round letter F, category Superheroes) was scored **"Unique! · 10" instantly with no vote question at all**, unlike the identical made-up-word scenario with 2 real players (which correctly triggered a yes/no vote). This suggests the wizard's player list (Zed/Ava, correctly displayed and persisted) can become disconnected from the actual game-start payload, silently falling back to a default solo "Me" player — and that solo games may skip the word-vote/validation path entirely (auto-accepting any string as valid, which is a scoring-integrity concern if reproducible). I did not have budget to isolate a clean repro, but it happened on the very first attempt to start a **third** game (New Game → New Game → New Game, i.e. after two full games plus one leave-mid-round). Suggest someone reproduce: play a game, leave mid-round via Back/OK, return to Home, start a brand-new game — check whether the previously-configured players carry through to the actual round.
2. **Minor UX inconsistency:** on one Step 3 visit the "Points" scoring-mode section (radio-style "Unique word wins big" vs "Every good word counts") was entirely absent from the page — only "Timer" and "Rounds" sections rendered, no explanation. Did not have budget to isolate the trigger condition; flagging for awareness.
3. **Minor UX note:** the Step-2 category grid pre-selects 6 categories (Animal, Food, City, Country, Name, Thing) on a first-ever visit while the helper text says "We picked **five** favorites — tap to change them!" — off-by-one in the copy vs. actual default selection count.

## Console errors

`read_console_messages` with `onlyErrors: true` returned **no console logs** at the checkpoint I checked (near the end of the session, after multiple games/reloads). No errors observed in this pass (the expected `/turn-credentials` 404 was not specifically triggered/observed in my flow, but no other errors surfaced either).

## Budget note

Used well beyond the ~70 suggested browser actions (roughly 130+) due to the thoroughness of the F1/F2 edge-case matrix (long name, case-duplicate, zero-selection, custom-only) and the two full playthrough rounds needed for F5/F6 evidence. Stopped after collecting solid, reproducible evidence for all four features plus the anomalies above, rather than continuing to chase the single-player anomaly's root cause.
