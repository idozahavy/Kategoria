# QA Player 3 - CHAOS (Arabic RTL + English, pass-and-play, tablet 768x1024)

## Setup / path taken

- The live site https://kategoria.pages.dev was blocked by the browser pane's site permissions for my tab. I tested the local dev server instead (http://localhost:5180, then http://127.0.0.1:5180). The git tree was clean at HEAD 8ca489b, so this should be the same code as the live site.
- localhost:5180 was shared with other testers (same origin, so the same IndexedDB and localStorage). Their games kept overwriting `categories-active-game`, so my reload tests there resumed _their_ games. I moved to 127.0.0.1:5180, which is a separate origin with isolated storage, for the main run.
- Path on localhost: Arabic UI (dir=rtl) -> New game -> player attacks -> points/timer -> round 1 (letter ل) with chaos answers -> reload. Resume picked up another tester's game (see observations).
- Path on 127.0.0.1: Arabic -> New game -> players علي + Bob -> category attacks (removed all, added a custom one) -> 1 round, no timer -> reload mid-round -> Done clicked repeatedly -> voting -> review -> reload mid-review -> browser back -> switched to English -> new game (letter R) with wrong-letter, accented and mixed-script answers.
- About 34 browser actions and 0 screenshots. Most driving was done by DOM clicks, because the background tab often did not render for coordinate clicks.

## Bugs

### HIGH - Clicking "Done" more than once skips player 2's turn and copies player 1's answers onto player 2

- Steps: pass-and-play with 2 players (Arabic, 1 round, no timer). Player 1 fills in both categories ("زرافة" in each). Click "انتهيت!" (Done) 3 times quickly. A double or triple tap on a tablet does the same thing.
- Expected: player 1 is submitted, then the "pass the device" screen appears for player 2 (Bob), who types his own answers.
- Actual: the game goes straight to "Let's check the words!" voting. Bob never got a turn. The IndexedDB save shows Bob with exactly player 1's words (`68b0 animal "زرافة"`, `68b0 <custom> "زرافة"`). The review then scores them as "same word · 5" for both players. So the wrong score comes from a skipped turn plus leaked answers.
- Likely cause (not verified in source): the round screen stays mounted when the active player changes, so the later clicks submit the still-filled draft as the next player. It needs a guard against clicking Done again during the hand-off, and the draft should be cleared or keyed per player.

### MED - Two tabs of the app (same origin) hijack each other's resume

- Steps: open the app in two tabs and start a different game in each. Reload tab A.
- Expected: tab A resumes its own game.
- Actual: tab A resumes whichever game wrote `localStorage['categories-active-game']` last. That was another tester's game, in English, with Hebrew words. My game was still in IndexedDB (drafts included) but could only be reached by editing the key by hand. The UI language setting is also shared between tabs, so my Arabic tab reloaded in English. This is uncommon for real families, but it is silent and looks like lost progress.

### LOW - A long custom category name is rejected without any message

- Steps: category screen -> type a name about 100 characters long into "أضف فئتك" (with an `<img ...>` prefix) -> click "إضافة" (Add).
- Expected: the category is added, or a message explains the length limit.
- Actual: nothing happens and no error is shown. A short name ("<b>pets</b>") was added fine. I did not check whether a length cap is the cause.

### LOW - Timer and round choices are not remembered for the next game

- I chose "no timer" and 1 round in the Arabic game. The next "New Game" (English) came back at 2:00 and 3 rounds. The custom category _was_ remembered, so what gets remembered is inconsistent. It may be intended.

### LOW - Answer inputs have no maxLength

- Answer fields have `maxLength=-1`. A 246-character answer was accepted and saved in full to IndexedDB. It did not crash anything, but nothing stops huge strings from going into saves or the P2P payload.

## Robustness results

| Attack                                                                   | Result                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Player name only spaces                                                  | Blocked: "الجميع يحتاج إلى اسم!" (everyone needs a name). PASS                                               |
| Duplicate player names                                                   | Blocked: "لاعبان لهما الاسم نفسه" (two players have the same name). PASS                                     |
| HTML/XSS player name `<b>x</b><img src=x onerror=alert(1)>`              | Shown as literal text on the pass screen, no img element in the DOM, no alert. PASS                          |
| Emoji + mixed-script name "🦄 سارةSara"                                  | Accepted and shown correctly. Profile key is stored lowercased. PASS                                         |
| Maximum players (clicked Add 20 times)                                   | Capped at 8 and the Add button becomes disabled. PASS                                                        |
| Minimum players (clicked Remove repeatedly)                              | Stops at 1 player with no Remove button left. PASS                                                           |
| Remove all categories                                                    | Next becomes disabled. PASS (no explanatory hint, but acceptable)                                            |
| Custom category containing HTML `<b>pets</b>`                            | Shown as literal text everywhere, including the voting question. PASS                                        |
| Double-click Next / Start / "Let's go" (setup)                           | Each moved forward exactly one screen. PASS                                                                  |
| Double/triple-click Done in a round                                      | **FAIL, HIGH bug above**                                                                                     |
| Double-click Yes in voting                                               | No double-advance seen. PASS                                                                                 |
| Answer of 246 characters                                                 | Accepted and saved, no crash. The review layout was not checked visually                                     |
| Answer `<img src=x onerror=alert(1)>`                                    | Saved as text, no execution. PASS                                                                            |
| Emoji-only answer, digits-only answer, Arabic with diacritics (لَيْمُون) | Accepted as input. Their scoring was not reached because of the shared-origin resume issue                   |
| Same word in every category                                              | Accepted. Scored 5 each as "same word" once the bug copied it to the other player                            |
| Wrong starting letter (Zebra, Émile on R)                                | Auto-scored "Wrong letter · 0". PASS                                                                         |
| Reload mid-round (isolated origin)                                       | Resumes on the "pass the device" screen for the current player. Same letter, drafts restored. PASS           |
| Reload mid-review                                                        | Resumes on the final results/podium screen with scores intact (the "show results" step was effectively done) |
| Browser back after reload                                                | Went back to the home screen without an error or stuck state. PASS                                           |
| Switch language (Arabic -> English) on home                              | dir flips rtl -> ltr and all labels update. PASS. I did not test switching during an active round            |

## Console errors

- None. `read_console_messages` with onlyErrors returned nothing after every group of attacks, on both origins.

## Fun score

6/10. Arabic RTL looks consistent, the validation messages are friendly and kid-appropriate, and the HTML escaping is solid everywhere I tried. The Done double-tap bug hurts pass-and-play badly, though: tablets get accidental double taps all the time, and a skipped turn with copied answers ruins the round. I did not see a "did you know" fact in my rounds.
