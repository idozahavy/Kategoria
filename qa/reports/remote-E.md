# QA Playtest Report — remote-E

**Tester persona:** skeptical/naive QA tester, verifying rules precisely
**Origin under test:** http://127.0.0.1:5181/
**Date:** 2026-09-09
**Scope:** F3 (connected-device round results), F4 (best-5 standings), F7 (word-validation vote: big-screen vs phones, majority rule)

## Executive summary

Testing was **blocked at the connectivity layer**: in this build, the host ("Phones join in" lobby) can sustain only **one connected phone at a time**. Every time a second phone joins or an already-joined phone reconnects, the _previously_ connected phone is immediately kicked (its own screen shows "Lost the connection! Tap 'Try again' to jump back in.", and it disappears from the host's roster). This was reproduced **6 times in a row**, in both directions (Cleo joining kicks Dan; Dan joining/reconnecting kicks Cleo), including once _after_ advancing past the lobby into the category-picker and points/timer setup screens — so it is not limited to the initial "Who is playing?" screen. Once a game round has actually started, a second phone can no longer even find the room ("Couldn't find that room — check the code!"), so there is no way to add a missing player mid-round either.

Because F3, F4 and F7 as specified all fundamentally require **two phones connected to the same game at once**, this bug made it impossible to run the requested two-phone scenarios (Cleo + Dan simultaneously). I ran the full flow with **one real connected phone (Dan)** to observe as much of the intended behavior as the app would show, and used that to reason about F3/F4/F7. Where the described scenario genuinely needs 2 simultaneous players (the F7 majority-vote sub-cases a–e in particular), it could **not** be verified and is marked BLOCKED, not PASS/FAIL.

Console check on host: only two `POST http://127.0.0.1:5181/turn-credentials → 404` errors were seen, matching the expected dev-environment gap called out in the task brief (no other console errors were observed). This 404 (no TURN server available in dev) is a plausible contributing factor to the connection bug below, since without a TURN relay WebRTC peer connections are more fragile — but the observed symptom (a _second_ peer connection tearing down the first, cleanly and every time) looks like an application-level "single active peer" bug rather than random network flakiness.

---

## BUG-1 (Blocker): only one phone can stay connected to the host; a second phone's join/reconnect always disconnects the first

**Severity:** Critical / Blocker — breaks the entire "Phones join in" multiplayer mode for more than 1 phone, and directly prevents testing F3/F4/F7 as specified.

**Repro steps:**

1. Host: Home → New Game → "Phones join in" → note room code (e.g. `QHMM`).
2. Phone A (tab, unique `categories-device-id` in localStorage): navigate to `?join=QHMM`, enter name "Cleo", tap Join!. Result: Cleo's screen shows "You're in! Waiting for the host to start…". Host lobby (checked without touching Phone A's tab) shows "1 joined / Cleo".
3. Phone B (different tab, different unique device id): navigate to `?join=QHMM`, enter name "Dan", tap Join!. Result: Dan's screen shows "You're in!…". Host lobby now shows **"1 joined / Dan" — Cleo is gone**, and switching to Phone A's tab shows "🙈 Lost the connection! Tap 'Try again' to jump back in."
4. Tap "Try again" + "Join!" again on Phone A (Cleo). Result: Cleo reconnects, host now shows "1 joined / Cleo", and **Phone B (Dan) now shows "Lost the connection!"**.
5. Repeated steps 3–4 four times total (including once after the host had already advanced to the "How do you want to play?" category-picker screen, i.e. past the lobby) — the outcome is 100% consistent: whichever phone (re)connects most recently survives; the other is dropped within ~1 second.
6. Confirmed this is not a tab-visibility/backgrounding artifact: leaving the _not-yet-reconnecting_ phone's tab backgrounded for 3+ seconds while no new connection event occurs does **not** disconnect it — the drop only happens exactly when the other phone performs a new join/reconnect.
7. Once a round has actually started (Start! clicked with only 1 phone in the roster), a second phone can no longer join at all: navigating to `?join=<code>` and tapping Join! returns "🙈 Couldn't find that room — check the code!" — so a missing player cannot be added mid-game either.

**Expected:** Both phones should remain connected simultaneously; the host roster should accumulate all joined phones ("2 joined: Cleo, Dan"), matching the task brief's expected flow.

**Actual:** Host never shows more than 1 joined phone at a time; whichever phone joined/reconnected last wins, the other is forcibly disconnected.

**Impact on this test pass:** Every "phones join in" game I could actually start had exactly one real phone player (Dan) plus the host. I was not able to get Cleo and Dan into the same active round together, which blocks true verification of F3 ("results visible on connected devices" — plural), F4 ("best 5 player points" — needs multiple real players to see sorting), and especially F7's majority-vote math (needs ≥2 simultaneous voters; a–e in the brief are impossible to run as specified).

---

## F3 — "show last round results on connected devices, not just the big screen"

**Status: PARTIAL PASS (verified for 1 connected phone; could not verify with 2 phones simultaneously due to BUG-1)**

**What I tested:** Game 1 ("📺 Decide on the big screen", No timer, 1 round, categories Animal + Food, only Dan connected due to BUG-1). Letter drawn: **F**. Dan typed Animal="Fizzlefox", Food="Fizzcake", tapped Done!.

**Host screen after round ("Let's check the words!"), exact text:**

```
Let's check the words!
🐶 Animal — Dan — Fizzlefox — Unique! · 10
🍕 Food — Dan — Fizzcake — Unique! · 10

🏆 Standings
D Dan 20
See scores
```

**Dan's phone screen at the same moment, exact text:**

```
F
Round 1 of 2  (game 2 shown similarly; game 1 was "Round 1 of 1")
🐶 Animal — Dan — Fizzlefox — Unique! · 10
🍕 Food — Dan — Fizzcake — Unique! · 10

🏆 Standings
Dan 20

The next round starts on the big screen
```

This confirms the connected phone **does** receive and display the round results (both categories, the player's word, and a points badge) plus a "Standings" block, matching what the host shows, without any extra action needed on the phone. I repeated this for Game 2 round 1 (letter D, words "Dorptix"/"Dazzum") and round 2 (letter G, words "Gorptus"/"Gazzum") — same pattern held every time, and the phone's Standings total correctly accumulated (20 → 40).

**Caveat / what could not be verified:** the brief's scenario specifically wants BOTH phones to see the round results including **each other's** words and a shared Standings block with both totals. With only one real phone ever connected (BUG-1), I could not confirm that a second phone would receive the other player's word/points, nor that both phones' Standings blocks would agree with each other and with the host. Given F3's implementation clearly pushes full round state (all categories, all known players, standings) to at least one connected device, it is reasonably likely to extend correctly to N players, but this is inferred, not observed.

**UX note:** the phone's post-round text "The next round starts on the big screen" is a good, clear affordance telling the player they don't need to do anything.

---

## F4 — "after each round, show best 5 player points"

**Status: PARTIAL PASS (Standings/leaderboard UI exists and updates correctly every round on both host and phone; "top 5" sorting/truncation behavior could not be exercised because BUG-1 never allowed more than 1 real phone player in a round)**

**What I observed:** Every round-end screen (host "Let's check the words!" and the connected phone's results screen) includes a "🏆 Standings" block listing player name(s) and running point totals, e.g.:

```
🏆 Standings
D Dan 20      (after round 1)
D Dan 40      (after round 2, cumulative)
```

This block appears consistently on host and phone, immediately after each round, matching the "after each round" timing requirement, and totals accumulate correctly round over round (20 then 40 for Dan across Game 2's two rounds). The end-of-game "Scores" screen also shows a 👑 crown + winner banner ("Dan wins! 🎉").

**Not verified:** With only 1 real player ever active per game (see BUG-1), I could not populate a roster of more than 1 player to check that Standings (a) sorts by points, (b) truncates to the top 5 when there are more than 5 players, or (c) shows ties correctly. I did not use the host's local "Add robot"/manual player slots as a substitute, since the brief specifically asks for verification on "connected devices," and mixing in non-connected simulated players would not answer that question. This sub-behavior should be re-tested once BUG-1 is fixed, with genuinely 3+ simultaneous phones.

---

## F7 — word-validation vote (big screen vs phones, majority/half rule)

**Status: BLOCKED — could not be verified.** This is the feature most directly broken by BUG-1, since its entire premise (players voting on a word) needs ≥2 simultaneous participants.

**What I attempted:** In both Game 1 ("📺 Decide on the big screen") and Game 2 ("📱 Vote on phones"), with only Dan connected, I deliberately typed clearly-invented, non-dictionary words per category (e.g. Animal "Fizzlefox"/"Dorptix"/"Gorptus", Food "Fizzcake"/"Dazzum"/"Gazzum") expecting a validation prompt (host: "Is 'Fizzlefox' a real Animal?" 👍/👎, or phones: a vote screen). **In every one of the 4 rounds played (across both games), no vote screen ever appeared on the host or on Dan's phone** — the made-up word was immediately scored "Unique! · 10" and the round auto-advanced straight to "Let's check the words!" with a final score, in both "Decide on the big screen" and "Vote on phones" modes.

**Interpretation:** With a single player in the round, there is no one to dispute a word against, so this may be reasonable default behavior (nothing to vote on when you're the only submitter) rather than proof that F7 is broken outright. However, I was not able to confirm this either way, because:

- I could not get a second phone into the same round to see whether a genuinely disputed/unknown word between two players triggers the expected vote UI.
- I could not test any of the requested majority-math sub-scenarios (a) Cleo-alone-Yes → immediate accept, (b) Dan-No-then-Cleo-No → reject with live "1 of 2 voted" tally, (c) Dan-No-then-Cleo-Yes → 1-of-2 = half → accept, (d) host's "Or decide here:" override buttons, (e) "Vote sent" lock-out after voting — none of these could be exercised since they all require two simultaneously connected phones.
- Late-joining a second phone mid-round is not possible either ("Couldn't find that room" once a round has started), so there was no fallback way to bring a second voter in after the fact.

**Recommendation:** F7 needs to be re-tested end-to-end once BUG-1 (single-connection limit) is fixed. Until then, its core majority-vote logic is effectively unverified/unverifiable through the phones-join-in flow.

---

## Other observations

- Console errors on host: only `POST /turn-credentials → 404` (×2), which matches the task brief's "expected in dev, not a bug" note. No other JS errors were logged during either game.
- The "Try again" recovery button after a dropped phone connection does work mechanically (it returns to the Join form with room code and name preserved, and a fresh Join! reliably reconnects that phone) — the problem is purely that reconnecting one phone knocks out the other, not that reconnection itself is broken.
- Minor UX inconsistency: after tapping "Try again," the app returns to the Join form rather than automatically reconnecting; the room code and player name are helpfully preserved, but the user still has to tap "Join!" a second time. Not a blocker, just an extra tap.
- Category-picker chip toggling (step 2) worked correctly once I re-clicked a chip that didn't visually toggle on the first click (isolated one-off input timing issue, not reproducible pattern — flagged as a low-severity note, not a bug, since a repeat click fixed it immediately).

---

## Verdict

| Feature                                  | Result                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F3 (connected-device round results)      | PARTIAL PASS — confirmed working for 1 connected phone; 2-phone simultaneous case unverified due to BUG-1                  |
| F4 (best-5 standings after each round)   | PARTIAL PASS — Standings UI present and correct every round for 1 player; top-5 sorting/truncation unverified due to BUG-1 |
| F7 (word-validation vote, majority rule) | BLOCKED — could not be exercised at all; requires ≥2 simultaneous phones, which BUG-1 prevents                             |

**Top-line bug:** BUG-1 — the "Phones join in" host can only keep one phone connected at a time; each new phone join/reconnect immediately disconnects the previously-connected phone (reproduced 6/6 times, both directions, including past the lobby screen). This blocks the entire multi-phone experience, not just F3/F4/F7.
