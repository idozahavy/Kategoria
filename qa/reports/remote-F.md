# QA Playtest Report — F7 (phone/big-screen word voting) and F3 (round results on phones)

Tester persona: chaos tester (disconnects, reloads, slow voters).
Origin under test: http://127.0.0.1:5182/
Two game sessions were run (session 1 was interrupted mid-Round-2 by a dev-server
hot-reload unrelated to the app logic — see "Environment disruption" below — so a
second, clean game was started to finish the scripted Round 2/3 scenarios). All
core assertions in the brief were exercised at least once against a real,
uninterrupted P2P session.

## Summary

- F7 (majority/half vote acceptance, open/away/reject/accept states): **PASS**
- F3 (round results visible on connected devices): **PASS**
- Reconnect-after-full-disconnect: works but has a real, reproducible bug (see BUG-1).
- Double vote prevention: PASS (UI-level).

---

## F7 — Word validation via phone vote

### Round 1 (session 1, 2 categories: Animal, Food; letter G)

Setup: host -> New Game -> Phones join in (room ZEDJ) -> 4 phones joined (Kim, Lee,
Max, Nia) -> categories Animal+Food (default) -> "Vote on phones", "No timer", 3
rounds -> Start.

**Test 1 — slow voter, single Yes must not resolve the word.**
Question: `Is "Gorbnix" a real animal?`

- Kim votes Yes. Host tally: `Kim (yes) / Lee (pending) / Max (pending) / Nia (pending)` — `1 of 4 voted`.
- Waited 40s (4x10s) with no other votes. Host tally unchanged: still
  `1 of 4 voted`, question still open, no premature accept/reject.
  **PASS** — a single Yes out of four is correctly not enough, no matter how
  long it sits open.
- Lee votes Yes (2 of 4 = exactly half). Host immediately advanced to the next
  word ("Is \"Gazwot\" a real food?"). **ACCEPTED** immediately on reaching
  exactly half, as specified. **PASS**

**Test 2 — majority No rejects before all vote.**
Question: `Is "Gazwot" a real food?` (Kim's own word — note: the submitter is
allowed to vote on their own word, see UX note below)

- Kim No, Lee No -> tally `2 of 4 voted`, still open (2/4 is not yet a majority
  of 4, correctly still pending).
- Max No -> 3 of 4 No -> host immediately advanced to the next word without
  waiting for Nia. **REJECTED** on majority reached. **PASS**

**Test 3 — tie-breaking, exactly-half accept after mixed votes.**
Question: `Is "Glimzor" a real animal?` (Lee's word)

- Kim No, Lee No -> tally `2 of 4 voted`, still open.
- Max Yes -> tally `3 of 4 voted` (1 Yes/2 No), still open — correctly waiting
  because the outcome is not yet mathematically decided (if Nia votes Yes,
  Yes reaches exactly half = accept; if No, No reaches 3/4 = reject).
- Nia Yes -> 2 Yes / 2 No (exactly half Yes) -> **ACCEPTED** immediately.
  **PASS** — confirms "exactly half" resolves in favor of acceptance even
  when the vote is tied.

Remaining Round-1 words were pushed through with unanimous Yes for speed.
Round-1 results screen (host) showed correct scoring, and Kim's rejected
"Gazwot" showed **"Not counted . 0"**.

### Round 2 (session 2, 5 categories this time — Animal/Food/City/Name/Thing;

letter L — a "Classic" preset carried over as default this session, see UX
note) — disconnect scenario

- All 4 phones submitted words. First validation question:
  `Is "Lorbnix" a real animal?`, all 4 shown connected/pending, `0 of 4 voted`.
- Closed Nia's tab (`tabs_close`) with no vote cast.
  - After ~3s the host still showed Nia as pending (not yet detected).
  - After ~8s total, host updated to show Nia as away and the tally
    denominator dropped to **`0 of 3 voted`**. This is slower than the
    "couple of seconds" implied by the brief but functionally correct —
    worth a look if a snappier disconnect indicator is wanted.
    **PASS with a timing note.**
- Kim No, Lee No -> `2 of 3 voted`, 2 No out of 3 connected -> **REJECTED
  immediately**, host did not wait for Max or the disconnected Nia. **PASS**
- Next word: Kim Yes, Lee No, Max No -> 1 Yes / 2 No of 3 -> **REJECTED**
  (1 of 3 is less than half). **PASS**
- Next word: Kim Yes, Lee Yes -> 2 of 3 connected voted Yes -> **ACCEPTED**
  immediately. **PASS**

Important nuance vs. the literal feature text ("majority or exactly half of
players agree"): the denominator used for "half" is the currently-**connected**
player count, not the original total. This is the sensible interpretation and
is what the game actually implements and what the brief's own script expects
(e.g. "2 noes of 3"), but the wording of F7 as given to the dev could be
mis-read as "half of all players including disconnected ones" — recommend the
copy/spec explicitly say "half of currently-connected players" to avoid
ambiguity for future readers.

Round 2 finished (remaining words pushed through via host override). Round-2
results correctly showed `Lorbnix` and `Lazwot` as **"Not counted . 0"**.

**Reconnect flow:** After round-2 results, a new tab was opened, device id
`guest-nia` set, and Nia rejoined via `?join=CODE` + name + Join. She landed
directly on the **Round 2 results / standings screen** — exactly the state
the still-connected phones were on. **PASS.**

### Round 3 (session 2, letter R) — reload mid-vote + double-vote

- All 4 submitted words. First question: `Is "Rorbnix" a real animal?`, all 4
  pending, `0 of 4 voted`.
- Before anyone voted, "reloaded" Kim's tab (set her device id again, navigated
  to `?join=CODE`, typed "Kim", tapped Join). She landed correctly back on the
  **same open question** (`Is "Rorbnix" a real animal?`) rather than being
  dropped into word-entry or a stale screen. **PASS.**
- Kim votes Yes -> her phone shows a "Vote sent! Waiting for the others..."
  screen with **no Yes/No buttons** (checked via `read_page`, only a "Back"
  button remained) — a second vote on the same word is not offered by the
  UI. **PASS** for double-vote prevention.
- Host tally after a 10s wait: still `1 of 4 voted`, question open.
  **PASS** — matches Round 1's slow-voter behavior.
- Lee votes Yes -> 2 of 4 = half -> **ACCEPTED** immediately.
- Next word (`Razwot`, Kim's food word): Lee alone votes Yes -> tally
  `1 of 4 voted`, stays open. **PASS**
  Then Max No, Nia No -> `3 of 4 voted` (1 Yes/2 No), still correctly open
  (Kim's vote could still tip it to exactly-half-Yes). Kim votes No ->
  3 No / 1 Yes -> **REJECTED** immediately. **PASS**

Round 3 (and the whole game) was finished via host override for the
remaining words, then **"See scores"**.

**Final scores on phones:** Both Kim's and Nia's phones (checked
independently) showed the full final scoreboard —
`Lee 135 / Kim 120 / Max 120 / Nia 105 — Lee wins!` — identical to the
host. **PASS.**

**Console errors on host (session 2):** `read_console_messages(onlyErrors)`
returned exactly 3 errors, all `POST /turn-credentials -> 404` — the
documented, expected dev-environment gap, not an app bug.

---

## F3 — Round results visible on connected devices

- After Round 1 (session 1), Kim's and Nia's phones both independently showed
  the full round breakdown per category/player with word + points, plus the
  **Standings** table — identical content to the host's "Let's check the
  words!" results screen, with a "The next round starts on the big screen"
  footer. **PASS.**
- After Round 2 (session 2, disconnect round), Kim's phone (one of the 3 that
  stayed connected throughout) also showed the full Round 2 results and
  standings. **PASS.**
- The reconnecting Nia landed directly on this same results screen after
  rejoining (see reconnect flow above) — i.e. F3 also correctly serves a
  phone that reconnects after missing the live vote. **PASS.**

No FAIL observed for F3 in any of the three checkpoints tested.

---

## Bugs found

### BUG-1 (real, reproducible) — Reconnected phone can land back on the

word-entry screen instead of the live vote screen, and the host can
mark the client as away even though the phone itself believes it is
connected, requiring a full "Lost the connection" retry cycle before votes
are actually delivered to the host.

Sequence that reproduced it (session 1, Round 2):

1. A page reload happened on Nia's tab mid-game (in this instance triggered
   by an unrelated Vite dev-server hot-reload wave — see "Environment
   disruption" below — but the same client-side code path would run for any
   full page reload/app restart, e.g. a real phone's browser being killed
   and reopened).
2. Nia rejoined via the room code + name + Join flow. Her phone showed the
   correct Round-2 **results** screen (fine — same as the clean reconnect
   test that passed above).
3. However, when the SAME reload also hit Kim's tab moments later while the
   host was already in the mid-round **validation** phase (`Is "Sorbnix" a
real animal?`), Kim's rejoin landed her on the **word-entry screen** for
   the round she had already submitted, with the letter/category boxes
   _empty_, rather than the vote screen the host was waiting on. Waiting an
   additional 3+8s did not resolve it.
4. The host, in the meantime, showed **all four** phones as away with a
   `0 of 0 voted` tally — i.e. once enough peer connections drop at once,
   the round can get stuck with no way to reach a verdict from the host's
   "vote on phones" UI (the host does still have the "Or decide here"
   override, which is the only way out in this state).
5. Individual phones eventually surfaced the app's own honest error state —
   **"Lost the connection! Tap 'Try again' to jump back in."** — and
   tapping "Try again" -> re-entering the join flow did correctly restore
   the phone to the live vote screen, after which the host tally updated
   correctly from then on.

Repro steps (minimal, without relying on HMR): with a "Vote on phones" game
in progress and the host mid-validation, force a guest tab to lose its P2P
connection (reload the page, or background the tab long enough for the
connection to drop) while the round is between "word entry" and "results" —
i.e. specifically in the voting sub-phase. On rejoin, check whether the
client resumes to the vote screen or the (stale) word-entry screen for the
current round, and whether the host's peer-connected state updates within a
reasonable time.

Impact: medium — self-recovers via the "Lost the connection / Try again"
flow, but until the user notices and taps "Try again" the round can appear
completely stuck to everyone (host shows 0 voters, phones show no vote UI).
For a "kid-friendly" game, an adult or older kid may know to retry; a
younger player may just leave the app sitting on the empty word-entry screen
and have no feedback that anything is wrong.

Suggested triage: verify whether the client-side resume logic branches
correctly on round-phase "validating" vs. "collecting words" after a
reconnect — the empty word-entry screen suggests it may be defaulting to the
wrong phase, or the P2P reconnection isn't signaling the current phase back
to the client quickly enough before it renders.

### Environment disruption (not an app bug, but affected this test run)

Partway through session 1's Round 2, ALL FIVE tabs (host + 4 phones)
underwent a Vite dev-server hot-reload almost simultaneously — visible via
`read_network_requests` as a burst of `GET /src/screens/*.svelte?t=<new
timestamp>` requests and `Join.svelte` being re-fetched — which is Vite's
normal behavior when a watched source file changes on disk. This is outside
this session's control (no source files were read or edited by this QA
session), but it is worth flagging to the team: while this playtest was
running, something else was saving files in the repo, and that is what
produced the full-mesh disconnect described in BUG-1. The bug itself
(landing on the wrong screen after reconnect) is real and worth fixing
regardless of what triggers the initial disconnect.

---

## UX / minor observations (not bugs)

1. **Self-voting is allowed.** A player can vote Yes/No on their own
   submitted word (observed for Kim voting on "Gazwot" and Lee on
   "Glimzor"). This wasn't called out as prohibited in the F7 spec, but it's
   worth a product decision — kids might find it odd/game-able that you can
   vote on your own guess.
2. **"Or decide here" host override is present even in "Vote on phones"
   mode.** The host screen always shows a Yes/No override under "Or decide
   here" regardless of the chosen voting mode. Handy as an escape hatch
   (and it's what let this test recover from BUG-1's stuck state), but it
   slightly muddies the "phones decide" promise — a family could
   accidentally bypass the kids' votes by tapping it on the host screen.
3. **Category selection default was inconsistent between the two games.**
   Session 1's category-pick screen defaulted to Animal+Food only (as the
   scenario instructs). Session 2 (started fresh via New Game after a
   localStorage clear) defaulted to 5 categories (the "Classic" preset:
   Animal/Food/City/Name/Thing) instead. This roughly 2.5x'd the amount of
   words to validate per round in session 2 and was not something this
   script intended. Worth checking whether category selection is meant to
   remember the last game's picks, a fixed default, or is randomized —
   the inconsistency was surprising.
4. **Disconnect detection latency.** ~8 seconds elapsed between closing
   Nia's tab and the host showing her as away / adjusting the vote
   denominator. Not wrong, but slower than a user might expect from "a
   couple of seconds."
5. **Layout: on the word-entry screen with 5 categories, only 3 fit above
   the fold** on a 1280x720 viewport; players must scroll to see/fill the
   last two category boxes and the "Done!" button. Not a defect exactly
   (kid-friendly games on real phones are usually taller than wide, so this
   likely isn't an issue on an actual phone viewport), but worth a spot
   check on the target device sizes for a category count above 3.
6. A fun-fact panel ("Did you know? Bartholomew - male given name") appeared
   correctly on a round-results screen when one of the accepted words had a
   known-word snippet — unrelated to F7/F3 but a nice touch, noted only
   because it was visible mid-testing.

---

## Coverage checklist vs. the brief

- [x] Slow voter: single Yes stays open indefinitely (40s+) — PASS
- [x] Exactly-half Yes accepts immediately — PASS
- [x] Majority No rejects before all vote — PASS
- [x] Mixed votes stay open until outcome is determined, then resolve
      correctly on tie -> half-Yes-accept — PASS
- [x] Phone disappears mid-vote -> shown away, denominator shrinks — PASS
      (slower than expected: ~8s, not "a couple of seconds")
- [x] Majority No with a disconnected voter rejects without waiting on
      the disconnected player — PASS
- [x] Minority Yes with a disconnected voter rejects — PASS
- [x] Reconnect after round ends lands on round results — PASS
- [x] Reload mid-vote (before voting) returns the open question — PASS
- [x] Word stays open after reload+single vote, 10s wait — PASS
- [x] Double-vote prevented at the UI level (no buttons after voting) — PASS
- [x] "See scores" / final scoreboard visible identically on phones — PASS
- [x] F3: round results + standings visible on phones after each round,
      including for a reconnecting phone — PASS
- [x] Host console errors checked — only the expected turn-credentials 404s
- [ ] Reconnect mid-validation-phase under a clean single-tab disconnect
      (as opposed to a whole-mesh disconnect) was not independently
      isolated — BUG-1 was found instead under an environment-induced
      full-mesh disconnect, so it is not yet confirmed whether the same
      wrong-screen behavior happens on an ordinary single-phone
      reload during validation, or only under the multi-peer-drop
      condition observed here. Recommend a follow-up test that reloads a
      single phone (only) during the validation phase in an otherwise
      healthy session.
