# QA Playtest Report — remote-D (chaos tester)

**Origin under test:** http://127.0.0.1:5182/
**Room code:** PZBA
**Setup:** New Game -> Phones join in -> 4 phones (Kim, Lee, Max, Nia) -> kept categories Animal + Food -> step 3: "📱 Vote on phones", "No timer", 3 rounds -> Start!

**Environment note:** The Browser pane reported "currently hidden" for the whole session, so `computer` click actions on refs/coordinates consistently timed out ("the press... could not be attributed to a frame" / 30s render-wait timeout). `get_page_text`, `read_page`, `find`, and `form_input` all worked fine on the hidden pane. As a workaround for buttons only, clicks were dispatched via `javascript_tool` as a genuine DOM `click()` on the exact target button (matched by visible text), which fires the same React event handlers as a real user click — this is an environment/tooling limitation, not a finding about the app itself, but it means true pointer-timing edge cases (double-taps, mid-animation clicks) were not exercised.

---

## F3 — "after each round in connected devices, show the last round results so players on connected devices can also view the last round, not just on big main device"

**Steps:** Played round 1 (letter C) with all 4 phones submitting made-up words in Animal + Food, resolved the word-check votes, then read `get_page_text` on the host and on all 4 phone tabs right after the round-1 results screen appeared (before tapping "Next round").

**Host round-1 results (exact text):**

```
🐶 Animal
Kim  Corblax   Unique! · 10
Lee  Cazoodle  Unique! · 9
Max  Curnobble Unique! · 8
Nia  Cribbowat Unique! · 7
🍕 Food
Kim  Crendof   Not counted · 0
Lee  Chompwig  Unique! · 9
Max  Clonfrit  Unique! · 8
Nia  Cundazzle Unique! · 7
🏆 Standings
Lee 18 · Max 16 · Nia 14 · Kim 10
Next round / See scores
```

**Each of the 4 phones (Kim, Lee/tab-17, Max, Nia)** independently returned via `get_page_text` the _identical_ block: same letter (C), "Round 1 of 3", the same per-category word/point table for all 4 players, the same "🏆 Standings" totals (Lee 18, Max 16, Nia 14, Kim 10), and a footer line **"The next round starts on the big screen"**. Verified byte-for-byte identical across all 4 phone tabs and the host.

**Round 2 reconnect test:** Nia's tab was closed mid-vote (without voting) during round 2, then reconnected in a brand-new tab (same device id `guest-nia`, `?join=PZBA`, name "Nia") _after_ round 2's results were already showing on the host. On landing, Nia's phone immediately rendered the full round-2 results screen (all 8 words + points + Standings, Lee 36/Max 32/Nia 28/Kim 20) — i.e. a phone that was absent for the whole voting phase of a round still gets the round's results correctly once it rejoins, without needing anyone to resend anything.

**Verdict: PASS.** Every connected phone shows the full last-round results (all categories, every player's word + points, Standings block) matching the host exactly, both for phones that stayed connected through the round and for one that dropped and reconnected after the round ended.

**UX note (minor, not a functional bug):** the phone's results screen doesn't have a visible "Next round" or "waiting for host" spinner — only a plain caption "The next round starts on the big screen". A player who doesn't notice this caption might wonder if their screen is frozen since there's no countdown/animation cue. Not blocking, just a small clarity opportunity.

---

## F7 — word-vote decided on phones, half-or-more Yes accepts

**Steps / observations, round 1 (fresh state, all 4 connected and voting normally):**

1. Q: `Is "Corblax" a real animal?` — Kim voted Yes (host tally: "1 of 4 voted", 👍 Kim, ⏳ Lee/Max/Nia) — Lee then voted Yes. **Immediately** (before Max or Nia voted) the host advanced to the next word ("Is 'Crendof' a real food?", tally reset to "0 of 4 voted"). Max's own phone, which had not voted on Corblax at all, was also already showing the new question. => **Exactly-half (2 of 4) Yes accepts immediately, without waiting for the remaining players.** Matches spec.
2. Q: `Is "Crendof" a real food?` — Kim No, Lee No (host: "2 of 4 voted", still waiting, correctly _not_ resolved yet since 2-of-4 No is not yet a majority) — Max then voted No (3rd No). Host immediately advanced to the next word ("Is 'Cazoodle' a real animal?"). => **3-of-4 (majority) No rejects immediately.** "Crendof" later showed "Not counted · 0" in the round-1 results. Matches spec.
3. Q: `Is "Cazoodle" a real animal?` — Kim No, Lee No (host: "2 of 4 voted", still waiting — correctly not resolved with 2 No/0 Yes since Max+Nia could still tie it). Max then voted Yes (host: "3 of 4 voted", 2 No/1 Yes, still waiting). Nia then voted Yes — host immediately advanced ("Is 'Chompwig' a real food?"). Final tally on that word was 2 Yes / 2 No = exactly half Yes. => **Exactly-half Yes accepts, even when it arrives as the last of 4 votes and after 2 No votes were already in.** Matches spec.

Remaining round-1 words were resolved with Kim+Lee both voting Yes (2-of-4, confirmed sufficient), which the host consistently resolved right after the 2nd vote landed — the live tally UI (⏳/👍/👎 per player, "N of 4 voted") updated correctly and instantly after every phone vote in all cases observed.

**Disconnect-mid-vote test (round 2):** During the vote on "Is 'Dazzlop' a real animal?" (0 of 4 voted), Nia's tab was closed via `tabs_close` without voting. Kim voted No, Lee voted No (host: "2 of 4 voted", 👎/👎, still waiting — correct, since with Nia gone this isn't yet decisive). Max then voted Yes (host: "3 of 4 voted", 👎👎👍, ⏳ Nia). The vote **did not hang**: within ~5 seconds (one `wait 5s` + read) the host had moved on to the next word ("Is 'Drenfik' a real food?", tally reset) on its own — no need to use the "Or decide here" host override. "Dazzlop" later showed "Not counted · 0" in the round-2 results (2 No / 1 Yes among the 3 still-connected players = majority No). => **The vote correctly resolves once every still-connected player has voted, ignoring the disconnected player, and does not hang.** Matches spec.

**UX/display quirk (minor):** even after Nia's tab was closed, the host's tally line kept saying "**N of 4** voted" and kept showing "⏳ Nia" — the denominator/roster never reflected that a player had actually left. The _resolution logic_ correctly excludes the disconnected player (it resolved on the 3 connected votes), but the _displayed_ count is misleading — a host watching the screen would reasonably (and incorrectly) believe the game is still waiting on Nia to vote, rather than realizing it already moved on because it's using a 3-person quorum. Worth a UI fix (e.g. "⏳ Nia (disconnected)" or excluding her from the "of 4").

**Reload-mid-vote test (round 3) — BUG FOUND:**
Round 3 (letter K) started; all 4 phones submitted words. The first vote question appeared: `Is "Kazzomp" a real animal?` (Kim's own animal word), "0 of 4 voted". Kim's tab was then reloaded (`navigate` to `?join=PZBA`, same device id `guest-kim`, name "Kim" re-entered, Join! tapped) _while this vote was open_.

- Kim's reloaded phone correctly received the still-open question back: `Is "Kazzomp" a real animal?` with fresh Yes/No buttons — **PASS** for "does Kim get the open vote question back".
- Kim tapped Yes. Host tally showed "1 of 4 voted" (👍 Kim only). Kim's own phone then showed "Vote sent! Waiting for the others…" with the Yes/No buttons gone — **PASS** for "can Kim still vote exactly once" (no way to vote again was exposed in the UI).
- **However:** immediately after that single Yes vote (1 of 4, well short of the 2-of-4 "half" quorum), the word **resolved and was accepted anyway.** The host silently advanced past "Kazzomp" to the _next_ question, "Is 'Klimzor' a real food?" (Kim's food word) — and that word _also_ resolved and got accepted off a **single vote** (Lee happened to be the only one who voted on it, 1 of 4). Max's and Nia's phones, which never got a chance to vote on either "Kazzomp" or "Klimzor", were found already sitting on the _third_ question ("Is 'Korblatt' a real animal?", Lee's word) when checked — i.e. two words in a row were resolved with only 1 of the required 2 votes present. Confirmed in the round-3 results screen: both **"Kazzomp" and "Klimzor" show "Unique! · 10"** (full points, counted as accepted) despite never reaching the half-of-4 threshold.
- Voting on the subsequent 6 words in round 3 (Korblatt onward) behaved normally again — each required 2 votes (Kim+Lee Yes) before the host advanced, matching the spec. So the bug appears to be specifically triggered around the reload event, not a permanent regression for the rest of the round.

**Bug — precise repro:**

1. Start a phones-join, vote-on-phones game with 4 players, no timer, and get to the word-check phase for round N.
2. While the _first_ vote question of that round is open and **before anyone has voted enough to resolve it**, have the word's own author (or any player) reload/rejoin their tab (same device id, `?join=CODE`, re-enter name, tap Join!) mid-vote.
3. Have that reloaded player cast the single vote they're offered.
4. Observe: the word is accepted and the host advances to the next question with only **1 of 4** votes counted (not the required half-or-more = 2 of 4). This repeats for the very next word too (2 words in a row under-quorate) before self-correcting.
5. Confirmed via the round results screen: both under-voted words are shown as `Unique! · <points>` (fully counted), not flagged as any kind of exception.

This is the most serious bug found: it lets a word get silently accepted/scored on far less than the "half or more" agreement the feature promises, right after a reconnect — a real family playing this could end up with wrong scores and no indication anything went wrong.

**Verdict: PASS for the core majority/exactly-half resolution logic and the disconnect-mid-vote non-hang behavior (round 1 and round 2 scenarios all matched spec exactly). FAIL for the reload-mid-vote scenario (round 3): reconnecting during an open vote can cause that word (and the next one) to be accepted on far fewer than the required half of votes.** Given the reload scenario was explicitly one of the two required round-3 checks in the test script, F7 is graded **FAIL** overall due to this reproducible under-quorum acceptance bug, with the rest of the feature (majority/half-vote resolution, live tally, disconnect handling) working correctly.

---

## Other observations

- Category selection screen ("Pick categories") defaulted to a 5-category "Classic" preset (Animal, Food, City, Name, Thing all pre-toggled on); toggling City/Name/Thing off to leave just Animal+Food worked correctly and instantly (chip state flips, no lag).
- Step-3 defaults were already "📱 Vote on phones" + Rounds=3, so only "No timer" needed an explicit tap.
- Scoring: identical-uniqueness words across players in the same round got descending points (10/9/8/7) rather than a flat 10 each — this looks like a tie-break/order-based scoring rule, not obviously a bug, but worth confirming against design intent since the product brief for F7 talks about "any real word 10 points" as one of the scoring modes; the game may have been running under "Unique words win big" mode by default, which is a separate (working-as-designed) system, not part of F3/F7.
- Final "Scores" screen: host shows "👑 Lee wins!" with full standings (Lee 54, Max 48, Nia 42, Kim 40) and "One more round! / Play again / Home"; every phone checked (Kim, Max) showed the identical final standings and "Lee wins!" banner, just without the host-only replay buttons.
- `read_console_messages(onlyErrors)` on the host at the end of the game showed exactly one error: a 404 for `/turn-credentials` — expected in dev per the test brief, not a bug.
- No crashes, blank screens, or stuck spinners were seen anywhere else in the ~3-round, 4-phone session, including through 1 forced tab close and 2 reload/rejoin cycles.

---

## Summary

| Feature                                            | Verdict                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3 (round results visible on all connected phones) | **PASS**                                                                                                                                                                   |
| F7 (phone-vote word validation, half-or-more rule) | **FAIL** — reproducible under-quorum acceptance when a player reloads/rejoins during an open vote (2 consecutive words accepted off 1 vote instead of the required 2 of 4) |

**Worst bug:** F7 vote-quorum bypass on reconnect — a word (and the following word) can be silently accepted and fully scored with only 1 of 4 votes cast, right after a player reloads mid-vote in round 3. Repro steps above.
