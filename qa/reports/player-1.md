# QA Player 1 - RUSHER (English, solo vs robot, 1-min timer, phone 375x812)

Date: 2026-09-26

## Setup / path taken

- NOTE: https://kategoria.pages.dev was blocked by the Browser pane's site permissions for my tab, so I played on the local dev server (http://localhost:5180, current main, same code). Tab was shared-origin with other testers, so localStorage/IndexedDB were shared: the landing page opened in Arabic (another tester's language choice) and showed "Continue game".
- Path: Landing -> tap "English" -> New Game -> Add robot -> Next (blocked: "Everyone needs a name!") -> type name "Rush" -> Next -> Quick pick "Classic" -> Next -> "Fast (1 min)" -> Fewer rounds (3 -> 2) -> Start! -> "I'm ready!" -> typing.
- Round 1 (letter T): filled 4/5, left "Thing" blank, let the timer expire.
- Round 2 (letter I): filled all 5 (one wrong letter on purpose: "Banana"), tapped Done! early.
- Final results -> Play again -> Round 1 of new game (letter E): 2/5 filled, Done! early -> review.

## Bugs

1. MED - Fun fact leaks raw Wikidata editorial text.
   - Steps: solo vs robot, letter T, robot answers "tortoise" for Animal; review screen "Did you know?" card.
   - Expected: a kid-friendly sentence about tortoises.
   - Actual: "Reptile with a shell, including tortoises, terrapins, and sea turtles (for the taxon use Q223044)." - contains an internal Wikidata instruction and a Q-id, and describes turtles (order Testudines) rather than tortoises. The source text should be filtered for parentheticals like "(for the ... use Q...)" / any "Q\d+" token.
2. MED - Name field placeholder "Me" suggests a default name, but it is empty and blocks Next.
   - Steps: New Game -> Add robot -> Next.
   - Expected: player 1 defaults to a name (placeholder "Me" implies it) or the field is focused/highlighted.
   - Actual: "Everyone needs a name!" error; also after adding the robot the placeholder changes from "Me" to "Name 1". Rusher is stopped on the first screen.
3. LOW - Tapping a saved-player chip (e.g. "Noa") did nothing visible.
   - Steps: player setup screen, tap "Noa" chip with an empty name row.
   - Expected: Noa fills the empty row / is added.
   - Actual: aria-pressed stays false, name field stays empty, no feedback. (Possibly because rows were full - no message either way.)
4. LOW - Two different timer values in the DOM at the same time.
   - Steps: round 1 with timer running, get page text near the end.
   - Actual: text contains both "0:08" and "0:10" (e.g. header pill + a floating/sticky duplicate out of sync by 2 s). Worth checking the two timer renderings use the same source.
5. LOW (possible) - After scrolling the review screen down on the phone, the top ~60% of the viewport was blank background with the cards only in the lower part (screenshot). May be a mid-scroll/entrance-animation capture, but worth a re-check with /visual-check.

## UX confusion

- Solo vs robot still shows "Player 1 of 2 - Rush, it's your turn! Pass the device - no peeking!" before every round. There is nobody to pass to; for solo it is an extra tap and confusing copy.
- Landing -> typing takes about 10 taps (language, New Game, Add robot, Next, name, Next, Classic, Next, timer, Start, I'm ready). For a rusher, a "Quick play vs robot" button on the home screen would get a game going in 1-2 taps.
- Categories screen: nothing is preselected and "Next" is not in the interactive list until a quick pick is chosen (fine, but no hint why).
- The two setup mode cards ("One shared screen" / "Phones join in") and saved-player chips are buttons with no accessible name (read_page shows bare "button"). The five answer textboxes on the play screen also have no accessible name (the category label is not linked to the input).
- Standings on the review screen show three bare numbers per player ("+35 40 75") with no labels; a kid will not know which is round score vs previous vs total.
- Mid-game review shows both "Next round" and "See scores" - unclear whether "See scores" ends the game.
- End screen has both "One more round!" and "Play again" - near-identical meaning; a rusher cannot tell the difference.
- "Game settings" gear shows only in round 1, gone in round 2 (probably intentional, but inconsistent).
- A stray "A" text node appears at the end of the play screen text (under the Done! button) - unclear what it is.
- Timer end with a blank field: went straight to review, blank shows "-" with no points and no label. Works, but there was no visible "Time's up!" moment captured in text.
- Robot: in the timed round it only answered 1/5 when time ran out, but in rounds where I hit Done! early it answered 4-5/5 instantly. Robot strength depends on whether you finish early - feels odd (finishing early helps the robot).
- Robot answers are all lowercase ("istanbul", "emmanuel", "iris") while player answers keep capitals - looks sloppy next to each other, especially for names/cities.
- Robot "insect" for Animal and "iris" for Name are borderline answers but accepted.

## Visual issues

- See bug 5 (blank area on scrolled review screen).
- End screen: winner avatar, crown, confetti look good; scores count up from 0 (text snapshot showed "0 75"). Fine.
- Play screen at 375 px: letter tile + timer pill + five category cards fit; Done! button sits at the very bottom edge (partially cut at 812 px height until scrolled).

## Fun-fact observations

- Round 1: "tortoise" - leaked "(for the taxon use Q223044)" and describes turtles (bug 1).
- Round 2: "irish stew - Lamb or mutton and root vegetable stew native to Ireland." - fine, English, makes sense.
- Round 3: "elephant seal - Genus of mammals." - correct but boring/not a fun fact for kids.
- Name category: my names (Tom, Isabella, Elizabeth) and robot names (iris, emmanuel) never got a fun fact - correct. Note "iris" is also a flower; it correctly got no fact because it was in Name.
- All facts were in English. Facts were always about a robot word, never about my words.

## Console errors

- Checked twice (after round 1 review and after round 3 review): no errors or warnings, only Vite debug "connecting/connected".

## Timings

- Landing -> typing answers: about 12 actions/taps including one blocked Next (roughly 30-40 s for a real fast player).
- Timer: 1:00 counted down correctly; expiry moved to review automatically within ~1-2 s.
- Done! -> review: instant (under 3 s including robot answers and fun fact).

## Fun score

6/10 - Rounds are snappy and the end screen is celebratory, but setup is too many taps for a quick solo game, "pass the device" copy in solo is confusing, and fun facts range from broken (Wikidata Q-id) to dry ("Genus of mammals.").
