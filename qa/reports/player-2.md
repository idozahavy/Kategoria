# QA Player 2 - Completionist (Hebrew, pass-and-play, 3 players, desktop 1440x900)

## Setup / path taken

- NOTE: https://kategoria.pages.dev was blocked by the browser pane's site permissions for my tab. I tested the local dev server at http://localhost:5180 instead (same repo, clean HEAD 8ca489b). Results should match the live build unless production differs from HEAD.
- Home -> switched language to Hebrew (html dir=rtl, lang=he) -> opened "איך משחקים" (how-to) -> "יאללה, משחקים!".
- Who plays: "מסך אחד משותף", players דנה, יוסי, Tom (mixed Hebrew/Latin name on purpose).
- Categories: default Classic (חיה, אוכל, עיר, שם, דומם) + פרי + custom "דבר בבית ספר". Also tried adding empty custom (ignored, fine) and a custom "חיה" duplicate (accepted - see bug).
- Points/timer: unique-words scoring, no timer, 2 rounds, advanced: validation "בדיקה חכמה" (hybrid), online category check on, fun facts on, speed bonus on.
- Round 1 letter כ, round 2 letter ב. Real words plus one gibberish (כגכג), one blank, one wrong-letter word (אבטיח on ב).
- Voting, round results, standings, final results, share results (navigator.share stubbed to capture payload), change setup (שינוי הגדרות) and verified every setting is preserved.

## Bugs

1. MED - Custom category can duplicate a built-in category.
   - Steps: Categories screen -> type "חיה" in "הוספת קטגוריה משלכם" -> הוספה.
   - Expected: rejected (or silently selects the built-in 🐶 חיה).
   - Actual: a second "חיה" chip is added next to the selected built-in one; the round would have two identical rows.
2. MED - Vote question has broken Hebrew gender/grammar.
   - Steps: submit an unknown word so it goes to voting.
   - Expected: grammatical Hebrew, e.g. "האם "כלמנטינה" היא פרי אמיתי?" / neutral phrasing.
   - Actual: "האם "כלמנטינה" זו פרי אמיתית?" (פרי is masculine) and with the custom category: "האם "בריסטול" זו דבר בבית ספר אמיתית?" - the feminine template is glued to any category name. Suggest a gender-neutral template such as "האם "X" מתאים לקטגוריה: Y?".
3. LOW - Change-setup gear (⚙️ "הגדרות המשחק") is visible on the fill screen in round 1 but missing in round 2 (only "חזרה" is present). If intentional, it's inconsistent; if not, the mid-game entry point disappears.
4. LOW - Blank answer on round results shows only "—" with no badge/score, while every other row shows "label · points" (e.g. "אות לא נכונה · 0", "נפסלה בהצבעה · 0"). Expected e.g. "ריק · 0" (that string already exists in how-to).
5. LOW - Round results screen keeps the heading "בואו נבדוק את המילים!" (the voting heading) above the scored results; a results heading would be clearer.
6. LOW (probably environment) - Final results scores showed "0" for every player while the tab was in the background; the real total was only in the visually-hidden live region. Once the tab was rendered the counters showed 118/98/74. Count-up relies on requestAnimationFrame; worth making the final value render even if rAF never fires (e.g. print final value first when document.hidden).

## UX confusion

- Speed bonus with "בלי טיימר": allowed; in pass-and-play the bonus is per-turn speed, but nothing tells players that. Scores like 9/10/8 for identical-quality words look random to kids.
- Standings row shows three numbers "+58 60 118" with no labels (delta, previous, total) - readable once you know, but the bare "60" is ambiguous.
- Mode cards ("מסך אחד משותף" / "טלפונים מצטרפים", "כל הקטגוריות..." / "קטגוריה אחת...") and the scoring cards have no aria-pressed / accessible selected state (the chips do). Screen readers can't tell which is chosen.
- Change setup -> "מי משחק?" shows the whole recent-players roster (on this shared device incl. names from other sessions like "Rush", "Noa", an HTML-injection test name rendered safely as text, and a name that is just U+FFFD "�"). Fine functionally, but a long roster pushes the actual 3 selected players far down.
- "יוסי ניצח/ה! 🎉" - slash gender form is acceptable but a bit clunky for kids; could use "המנצח/ת" card or "כל הכבוד, יוסי!".

## RTL / translation issues

- dir=rtl and lang=he applied; no horizontal overflow at 1440 (scrollWidth 1425 < 1440).
- Round results: names right, score badges left - correct mirroring (screenshot checked).
- "ייחודית! · 10" - punctuation and middle dot render correctly in RTL.
- Mixed "Tom" name inside Hebrew rows renders correctly.
- Share text: "שיחקנו Kategoria! 🎉 / 👑 יוסי · 118 / 2. דנה · 98 / 3. Tom · 74" - "2." at the start of an RTL line will render as ".2" in many chat apps; consider "2) " or "🥈" style markers, and "Kategoria" (Latin brand) is fine.
- No English UI leftovers found on: home, how-to, player setup, categories, points/timer, advanced settings, handoff, fill, voting, results, standings, final, change setup. Only grammar issue is bug 2.

## Fun-fact observations

- Round 1: "הידעתם? כפר סבא - עיר בישראל." Hebrew, good (short but correct).
- Round 2: "הידעתם? בקבוק - מכל חלול, או לחלופין כלי קיבול בעל פייה צרה." Hebrew, good (dictionary tone, a bit dry for kids).
- No fun fact was ever shown for a שם (name) category word (כרמית, כנרת, בני, ברק, בתיה were all candidates). PASS.
- No English description appeared. PASS.

## Console errors

- Checked 3 times (after round 1, after final/change-setup). Only "[vite] connecting..." / "[vite] connected." debug lines. No errors or warnings.

## Fun score

7/10 - Smooth, fully Hebrew flow, fast pass-and-play handoffs and a nice "הידעתם?" card; points lost for the clunky gendered vote question (kids will notice), the unexplained speed-bonus point differences, and small result-screen inconsistencies.
