# Kategoria QA Playtest Report — remote-B

Origin under test: http://127.0.0.1:5181/
Tester: naive/skeptical QA persona, browser-driven only (mcp Claude_Browser tools)
Date: 2026-09-09

## CRITICAL ENVIRONMENT BLOCKER (read this first)

This session was run in a shared-browser-pool environment: `tabs_create` failed with
`"Could not open a new tab (Browser pane gone, gate off, or tab cap reached)"` on
**every** attempt (10+ retries spread across the whole session, including waits of
3-10 s between retries, and re-checks with `tabs_context`). The pool was pinned at a
hard cap of **9 tabs total**, shared across what `tabs_context` showed to be **6
concurrent QA sessions** (origins seen: `localhost:5180`, `127.0.0.1:5180`,
`localhost:5181`, `127.0.0.1:5181` = me, `localhost:5182`, `127.0.0.1:5182`).

Worse: my own first tab (`tab-8`, opened at the start of this session, on which I had
already set up a host game with room code `VBGP`) was **silently reassigned mid-session
to a different origin** (`127.0.0.1:5182`, a different room code `EJGC` appeared on
it) — i.e. the tab pool recycles tabId slots across agents even for tabs an agent
itself created and was actively using. I stopped touching `tab-8` the moment this was
detected, per the "never touch tabs you did not create" rule, and continued on my
remaining confirmed-own tab, `tab-3` (the only tab whose origin stayed pinned to
`http://127.0.0.1:5181` for the whole session).

**Net effect: I had exactly ONE browser tab for the entire test**, never two. The
scenario as specified needs a minimum of 2 tabs (1 host + >=1 phone) to exercise F3/F7
at all, and 4 tabs (1 host + 3 phones) to test the majority-vote arithmetic properly.
With only 1 tab I could not open a host screen and a phone screen at the same time, so
**F3 and F7 could not be exercised through real multi-device UI interaction** — this is
an environment/tooling capacity issue, not a defect in Kategoria, and I am not
reporting it as a product bug. I want it flagged loudly to whoever operates the QA
swarm though, since it means the "connected devices" scenario is currently
_untestable_ for any agent unlucky enough to end up with 1 tab.

What I did instead, to extract as much real signal as the single tab allowed:

- Confirmed structurally that Phones-join mode step 1 hard-blocks progress with 0
  phones ("Waiting for at least one player to join!"), so step 3 (where the F7
  phone-vs-screen choice lives) could not even be reached solo, and no "Add robot"
  escape hatch exists in Phones-join mode (robots are pass-and-play-only).
- Ran the full round flow twice in **local "One shared screen" (pass-and-play) mode**
  instead — same round-review/standings code path as far as I could tell from the UI,
  just not "connected devices". This let me get a real, high-confidence read on **F4**
  (which is not phone-specific) but only a structural/indirect read on F3 (I can say
  what the round-review screen contains when rendered on one device, not whether it
  reaches other devices) and no read at all on F7's vote-location/majority logic.

I retried `tabs_create` a final time immediately before writing this report; still
capped. If more tabs become available later, F3/F7 should be re-run for real before
trusting this report's verdict on them.

---

## F3 — "show last round results on connected devices too"

**Verdict: BLOCKED / NOT TESTABLE** (environment tab cap — see above). Cannot be
marked PASS or FAIL responsibly.

What I could and couldn't verify:

- Could NOT open a phone tab, so could not see whether a phone shows the round
  results/standings screen at all, partially, or not (a "waiting screen" only).
- Could confirm (host/solo device only) that the round-review screen itself _does_
  contain the full expected content: per-category word list with each player's word,
  per-word point value/status ("Unique!", "Same word", "Not counted"), a "Did you
  know?" trivia line, and a "Standings" card — see full transcript under F4 below,
  since that's where I captured it. This is necessary-but-not-sufficient evidence for
  F3: the content that _would_ need to reach phones exists and is well-formed on the
  device that renders it; whether it actually reaches other connected devices is
  exactly the part I could not test.

No bugs can be attributed to F3 from this run. **Recommend re-running this feature
specifically once >=2 tabs are available.**

## F4 — "after each round, show best 5 player points"

**Verdict: PASS** (tested twice, high confidence for the part that is testable
single-device; not phone-specific so the tab shortage did not block it).

### Test 1 — 3 players (Cleo, Dan, Eve), pass-and-play, 1 round, categories Animal+Food, letter "C", No timer

Steps: Home -> New Game -> "One shared screen" -> added players Cleo, Dan, Eve -> Next ->
deselected all default category chips except Animal & Food -> Next -> No timer, rounds
set to 1 (word-check left on default "hybrid") -> Start! -> each player's turn: Cleo
(Cat/Cheese), Dan (Cat/Chocolate), Eve (Crab/Cxyzzt) -> Done each turn -> host was
prompted `Is "Cxyzzt" a real food?` Yes/No -> answered No.

Exact on-screen review text after the round:

```
Let's check the words!
Animal
Cleo — Cat — Same word · 3
Dan — Cat — Same word · 5
Eve — Crab — Unique! · 9
Food
Cleo — Cheese — Unique! · 8
Dan — Chocolate — Unique! · 10
Eve — Cxyzzt — Not counted · 0
Did you know? Chocolate — ...
Standings
Dan 15 · Cleo 11 · Eve 9
See scores
```

Final "Scores" screen: same 3 players, Dan 15 / Cleo 11 / Eve 9, "Dan wins!".

With only 3 players the "best 5" cap can't be exercised (3 < 5), so I ran a second,
decisive test.

### Test 2 — 6 players (Host + Robo, Robo 2..5), pass-and-play, 1 round, categories Animal+Food, letter "J", No timer, word-check = "Don't check words"

This is the test that actually proves the cap. Round-review screen after the round
(quoted exactly):

```
Standings
Robo 2   13
Robo 3   13
Robo     8
Robo 5   8
Robo 4   4
See scores
```

Only **5 of the 6 players** appear on the round-review Standings card — "Host" (who
scored 0, the lowest) is dropped. This directly confirms the "best 5" cap works: it
shows exactly the top 5 by points and truncates the rest.

Then I clicked "See scores" to check the **end-of-game** Scores screen — this is a
_different_ screen from the per-round Standings card, and it correctly shows **all 6
players**, uncapped:

```
Scores
Robo 2   13  (crown)
Robo 3   13  (crown)
Robo     8
Robo 5   8
Robo 4   4
Host     0
Robo 2 & Robo 3 wins!
```

This is the right behavior: F4's "best 5" cap is scoped to the _after each round_
Standings card, not the final scoreboard (which correctly still lists everyone). No
bug — this is exactly what the feature spec asks for.

**F4: PASS.** (Verified single-device; the display-and-cap logic is almost certainly
identical for phones since it's rendered from the same round-result data structure,
but per F3's caveat above I cannot personally confirm it reaches phone screens.)

## F7 — "word validation: big screen vs connected devices, majority/half-or-more rule"

**Verdict: BLOCKED / NOT TESTABLE** (environment tab cap — see above). Cannot be
marked PASS or FAIL responsibly. I was not able to reach step 3 of a Phones-join setup
at all (it requires >=1 phone connected to unblock "Next" from step 1), so I never even
saw the "Vote on phones" / "Decide on the big screen" choice UI, let alone the
majority-vote arithmetic (2-of-3, early-exit on 2 No votes, host override buttons, or
the "N of 3 voted" live tally).

What I _can_ say from the pass-and-play runs: in solo/local mode there is no
phone-vs-screen choice at all in step 3 (confirmed: the step-3 "Points & timer" screen
in pass-and-play mode only ever showed Points / Timer / Rounds / Advanced — no "Word
votes" section), which is consistent with the feature being conditional on Phones-join
mode as described. The word-check-on-unknown-word flow itself does work correctly in
principle: entering a nonsense word ("Cxyzzt") triggered `Is "Cxyzzt" a real food?`
with Yes / No shown to the (sole) device holder, and answering No correctly zeroed the
word ("Not counted · 0") in the review. That's the single-device version of the same
underlying mechanic F7 extends to phones, but the phone-specific parts (routing the
question to phones vs. the host, the majority/half-or-more rule, the early-exit-on-
majority behavior, and the live "N of 3 voted" tally) are entirely untested.

**Recommend re-running this feature specifically once >=2 (ideally 4) tabs are
available** — it is the highest-risk untested feature of the three, since it has the
most new conditional logic (vote routing + majority arithmetic + early exit).

## Other findings (outside F3/F4/F7 scope, noticed incidentally)

1. **Possible scoring inconsistency for identical duplicate words** (Test 1 above):
   Cleo and Dan both submitted the exact word "Cat" for Animal (letter C). The review
   screen labeled both "Same word" (correct — duplicate detection works) but awarded
   **3 points to Cleo and 5 points to Dan** for the identical word in the same
   category/round. The selected points mode was the default, labeled "Unique words win
   big — Unique word 10 · same as someone 5", which implies both duplicates of the same
   word should score identically (5 each). Getting 3 vs 5 for the same word looks like
   a bug — worth a focused repro by someone with source access, since I was not able to
   inspect `src/` per this task's read-only-via-browser constraint. Precise repro:
   pass-and-play, 3 players, categories Animal+Food, default points mode, 1 round, no
   timer, have exactly 2 of 3 players enter the identical real word in one category —
   check whether their per-word point values in the round-review screen match.

2. **Nice UX touch, not a bug**: starting a brand-new local game remembers the
   previous game's player names as tap-to-re-add suggestion chips (I saw "Eve", "Cleo",
   "Dan" pre-offered after finishing a game with those names) and remembers the last
   category selection. Convenient for repeated local play.

3. **Tester error, not a bug, noted for transparency**: in Test 2 I initially typed
   "Ant"/"Apple" for the Host's turn without first checking the round's actual letter
   (it was "J", not "A"), so those were correctly rejected ("Not counted · 0"). Not a
   product defect — flagging only so the 0-score for "Host" in that test isn't misread
   as a validation bug.

4. **Console check** (on the only tab available, host/solo context):
   `read_console_messages(onlyErrors)` showed exactly two 404s consistent with the
   expected `/turn-credentials` dev-mode 404 called out in the task brief as not-a-bug.
   No other console errors observed at any point in the session.

## Summary table

| Feature                                         | Verdict                                          | Confidence |
| ----------------------------------------------- | ------------------------------------------------ | ---------- |
| F3 (connected-device round results)             | BLOCKED — not testable (1-tab environment limit) | n/a        |
| F4 (best-5 standings after round)               | PASS                                             | High       |
| F7 (phone/big-screen word-vote + majority rule) | BLOCKED — not testable (1-tab environment limit) | n/a        |
