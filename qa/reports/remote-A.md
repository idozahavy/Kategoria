# Kategoria QA Playtest — remote-A

Origin under test: http://localhost:5181/
Persona: naive family playtester (phones + a "big screen" host).

## IMPORTANT environment limitation (read first)

This session shares one browser pane across several concurrent QA agents testing
other origins (5180/5182, plus 127.0.0.1 variants of 5181/5180/5182). The pane has
a hard cap of 9 total tabs; the other agents held 7 of them for the entire session,
so this agent could only ever have **2 tabs of its own at once** (1 host + 1 guest
phone), no matter how many times `tabs_create` / `preview_start` were retried
(retried ~6 times spaced across the session; every attempt returned
"tab cap reached").

Practical effect: **the scenario's 2-phone (Ana + Ben) setup could not be run
concurrently.** I ran the full flow with a single connected phone ("Ana") instead,
and separately probed what a second, sequential identity does. This materially
limits confidence on F3 (does a phone see an*other* player's results) and makes
F7 (majority vote across 2 phones) effectively untestable this session — see below.
This is a tooling/environment constraint, not a defect in the app.

Secondary finding from the workaround attempt: when a joined phone's tab is
navigated away from the game URL (attempting to reuse the tab for a second
identity), the host's lobby **immediately drops that player** — the host reverted
from "1 joined / Ana" to "Waiting for players…" the moment the tab navigated away.
I did not get to determine whether this also happens on a simple reload/backgrounding
of a real phone mid-lobby (which would be bad UX for a family game), only on a full
navigation to a different URL. Worth a follow-up check.

---

## Setup performed

1. Host tab → **New Game** → **Phones join in** → room code **XXJR**.
2. Guest tab, `localStorage.setItem('categories-device-id','guest-ana-001')` →
   `?join=XXJR` → name "Ana" → **Join!** → host showed "1 joined / Ana".
3. Attempted a second guest ("Ben") via a new tab — blocked by the tab cap (see above).
4. Host step 2 (categories): default selection on load was **6** chips highlighted —
   Animal, Food, City, Country, Name, Thing — despite the on-screen copy reading
   _"We picked five favorites — tap to change them!"_ (mismatch, see Bugs).
   Deselected City, Country, Name, Thing (kept Animal, Food), then typed "Pokemon"
   into "Add your own" and pressed the add button → custom chip appeared with a
   generic 📝 icon and a ✕ to remove it.
   - Minor UX snag: the first click on the "Country" chip did not toggle it off
     (page had auto-scrolled after the previous click, and the click landed but
     didn't register); had to re-`find` the element and click again, after which
     it worked. Possible timing/hit-area issue around scroll+click.
5. Host step 3 (Points & timer): **"📱 Vote on phones"** was already preselected by
   default (teal border), with copy _"Everyone taps 👍 or 👎 — half or more say yes
   and it counts."_ The other option, **"📺 Decide on the big screen"** — _"Talk it
   over and tap together."_ Timer defaulted to "Normal (2 min)"; changed to
   **"No timer."** Rounds defaulted to **3**; decremented to **2**. Clicked **Start!**

---

## F3 — "show last round results on connected devices, not just the big screen"

**Steps:** Round 1, letter "C". Ana submitted Animal="Cat", Food="Cake",
Pokemon="Cravoodle" (made-up), tapped **Done!**

**Observed on Ana's phone (tab, in place, no extra taps needed):**

```
C
Round 1 of 2
🐶 Animal  Ana  Cat  Unique! · 10
🍕 Food    Ana  Cake  Unique! · 10
📝 Pokemon Ana  Cravoodle  Unique! · 10

🏆 Standings
Ana  30

The next round starts on the big screen
```

**Observed on host ("Let's check the words!" screen), same round:**

```
Let's check the words!
🐶 Animal  Ana  Cat  Unique! · 10
🍕 Food    Ana  Cake  Unique! · 10
📝 Pokemon Ana  Cravoodle  Unique! · 10

🏆 Standings
A Ana 30
Next round        See scores
```

Round 2 (letter "W", Ana left Pokemon blank): phone correctly showed the empty
category as **"—"** with 0 points added (score went 30 → 50), and the host review
additionally showed a "✨ Did you know? Waffle — family name" fact card.

**PASS / FAIL:** **PASS, with an important caveat.** The mechanism works exactly as
asked for a single connected phone — after each round it auto-updates in place to
show every category, the word, per-player attribution, points, and a Standings
block, with no extra navigation needed. **However**, the scenario's actual intent —
one phone seeing an*other* player's answers/results — could not be verified, since
only one phone was connected all session (see environment limitation above). The
UI clearly supports multiple rows per category (there's a player-name column), so
structurally it looks ready, but this needs a real 2-phone retest to confirm the
propagation itself (timing, whether both phones get the update simultaneously,
whether a phone that finishes late still sees the group's results).

**Bugs/confusion:** none observed in the single-phone flow itself.

---

## F4 — "show best 5 player points after each round"

**Observed:** Both the phone and the host review screen show a **"🏆 Standings"**
card immediately after each round, listing player name(s) and running total points
(e.g. "Ana 30" → "Ana 50" after round 2; final Scoreboard screen showed "👑 Ana 50 —
Ana wins! 🎉").

**PASS / FAIL:** **PASS for presence/structure** (the Standings block exists, updates
correctly, and shows correct cumulative totals for the one player present).
**UNVERIFIED for the "best 5" specific behavior** — sorting by score, a cap at 5
entries, tie-break handling — because the session never had more than 1 real
player. This is the part of F4 most worth a dedicated retest with 5+ players.

**Bugs/confusion:** none for what could be observed; the "best 5" claim itself is
simply untested.

---

## F7 — "vote on phones vs. decide on big screen, majority/half accepts the word"

**Observed (setup only):** The choice screen is correct and clear (see step 3
above) — "📱 Vote on phones" (preselected) vs "📺 Decide on the big screen," with
plain-language explanations of each, appropriate for a kid-friendly family game.

**Observed (gameplay):** This is the critical gap. **The vote UI itself
(👍/👎 tally, live counts, "Or decide here:" host override, the phone's
"vote sent" confirmation screen) was never seen this session.** Root causes:

1. Environment tab cap prevented a genuine second concurrent phone (see top of
   report), so the "does Ana's Yes and Ben's No get tallied correctly, does exactly
   half accept it, do both phones see the same live question" behavior from the
   scenario could not be exercised at all.
2. More importantly, a **separate, real finding**: in a single-connected-phone
   game, _every_ word — including a deliberately nonsense one I typed on purpose
   ("Bzqlorp" for the "Animal" category, and "Cravoodle" for "Pokemon") — was
   auto-scored **"Unique! · 10"** immediately, with the host's "Let's check the
   words!" screen appearing already fully resolved and no vote ever offered on
   either device. A word-info lookup clearly does run somewhere (the host showed
   "✨ Did you know? Bulbasaur — Pokémon species" for a real word), but it never
   routed the nonsense word to a dispute/vote.

**PASS / FAIL:** **UNTESTED / cannot confirm**, not "fail" — the flow that F7
describes was never triggered, so neither its correctness nor its UX could be
judged directly. But finding #2 above is worth flagging to the team as a specific,
reproducible follow-up: _confirm that with 2 or more real connected phones, an
actually-unrecognized word does get sent to a phone vote (or big-screen decision)
rather than being silently auto-accepted the way it was in solo play._ If solo-play
auto-accept is intentional (nobody to disagree with, so why ask), that's reasonable
product behavior — but it should be a deliberate, documented exception, not an
accidental side effect of the same code path that's supposed to catch unknown
words for F7.

**Bugs/confusion:** none observed in the parts of the flow that did render; the gap
is entirely about not being able to reach the core mechanic.

---

## Other observations / console

- `read_console_messages(onlyErrors)` on both host and phone tabs showed only the
  expected `POST http://localhost:5181/turn-credentials → 404 Not Found` (known dev
  limitation per the test brief). No other JS errors surfaced across category
  editing, mode selection, two full rounds, an empty-field submission + confirm
  dialog, and the final Scoreboard screen.
- Empty-answer confirmation dialog text: _"Some categories are still empty —
  finish your round anyway?"_ with **Cancel** / **Done!** — worked correctly and
  reads well for kids/parents.
- Final Scoreboard: `👑 Ana 50 — "Ana wins! 🎉"` with **"One more round!" / "Play
  again" / "Home"** on host, and a simpler **Scores / Ana 50 / "Ana wins! 🎉" / Home**
  on the phone (no "Play again" on phone — makes sense, that's a host-only control,
  worth confirming that's intentional but not a bug).

## Bug list (severity, repro)

1. **Copy/data mismatch (minor):** Category step says "We picked five favorites —
   tap to change them!" but 6 chips are pre-selected on a fresh New Game
   (Animal, Food, City, Country, Name, Thing). Repro: Home → New Game → Phones
   join in → Next → observe category screen.
2. **UX snag (minor, possibly flaky):** A category chip click right after the
   panel auto-scrolls can silently fail to toggle. Repro: on the category screen,
   click a chip located near the bottom of the visible area right after a
   previous click caused a scroll; the chip's highlighted state does not change on
   the first click but does on a second click.
3. **Needs product confirmation (not confirmed as a bug):** Navigating a joined
   phone's tab away from the game URL immediately removes that player from the
   host's lobby list (no "reconnecting" grace state observed). Only tested via a
   full URL navigation, not a real backgrounding/reload — recommend checking the
   real-world case since a phone screen lock/refresh mid-lobby is plausible for
   families.
4. **Top follow-up (not confirmed as a bug, high priority to check):** In a
   single-player round, obviously invalid/nonsense words are auto-accepted with
   full points and never routed to the F7 vote/decide flow. Needs a genuine
   2-phone retest to confirm the same word-checking logic actually fires the vote
   when there is someone to vote.

## Confidence

Given that F7 (the flagship feature under test) could not be exercised at all,
and F3's core multi-device claim (seeing an*other* player's results) and F4's
"best 5" ranking logic are both unverified due to the single-phone constraint,
confidence in this report's coverage is moderate-low. The parts that could be
observed all behaved correctly.
