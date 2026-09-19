# Kategoria visual review

## Review context and scope

**Deep review completed within the coverage recorded below.** No critical or major visual blocker was confirmed. The actionable findings are six moderate issues and four minor issues. The most useful first fixes are the host viewport height, narrow custom-category entry, phone round density, and repeated vote feedback.

| Field                | Value                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run                  | `20260919T043318Z`, 19 September 2026; capture timestamps are UTC in the evidence index                                                                                                                  |
| Report/app root      | `C:\Users\Ido\Documents\GitHub\CategoriesGame`                                                                                                                                                           |
| Target               | Working tree based on `ac40b5b4bb56aaef6cbbb142a64270b0aeed069a`; this is a development review, not a deployed-release certification                                                                     |
| Existing changes     | Modified README, CODESTYLE, environment example, App/main, p2p, NewGame, Resume, Review, Round and vite declarations; untracked analytics source/tests and agent instructions were present before review |
| Identity record      | [Source fingerprints](.visual-review/runs/20260919T043318Z/source-fingerprints.json); [discovery notes](.visual-review/runs/20260919T043318Z/reviewers/discovery.md)                                     |
| Launch               | `npm run dev -- --host 127.0.0.1 --port 5173`, from the project root; Vite 6.4.3                                                                                                                         |
| Inspection method    | Live UI navigation in Codex's in-app browser; two visual reviewers inspected saved captures; one scout mapped surfaces and investigated observed causes                                                  |
| Tested CSS viewports | 1440 × 1000 desktop; 1280 × 720 initial guest; 768 × 1024 tablet home; 390 × 844 phone; 320 × 740 narrow phone                                                                                           |
| Scale                | Browser zoom was not changed; measured DPR was 1. Stored screenshots of scrollable pages were sometimes rescaled by the capture tool; use CSS measurements for layout sizes                              |
| Themes/locales       | Light and dark; English and Hebrew journeys, Arabic host/guest journey; French, Russian and Spanish home screens                                                                                         |
| Roles/data           | Fresh anonymous entry, named solo Ada, two shared-screen humans, human plus robot, remote host and guest, returning saved game                                                                           |
| Application edits    | None. This review adds the report and review artifacts only                                                                                                                                              |
| Cleanup              | Review tabs closed, viewport override reset and local Vite session stopped; UI locale/theme returned to initial English/dark. Test profiles/results remain in the local development browser storage      |

The fresh reviewer started with a clean conversation and saw the home/solo captures before source, previous conclusions, or other reviewers' findings. The second visual reviewer covered size, language, and content variation without reading source. The coordinator exclusively controlled navigation. Host and guest tabs shared browser storage and are **not independent browser profiles or physical devices**.

The design reference is the locked [Candy Pop scheme](design/scheme.md): friendly rounded type, teal on warm cream, warm cocoa dark theme, chunky controls, RTL support, and a goal of fitting five category inputs on a phone. The intentionally narrow desktop shell is preserved as a design choice, not classified as a defect.

## Most consequential findings

| ID                                                                         | Severity          | Finding                                                                    | Consequence                                                   |
| -------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [VR-001](#vr-001--five-category-rounds-exceed-the-phone-viewport)          | Moderate          | Five-category rounds exceed the phone viewport                             | Default play requires scrolling through answer fields         |
| [VR-002](#vr-002--hebrew-custom-category-entry-collapses-to-a-sliver)      | Moderate          | Hebrew custom-category input leaves about 33 px for text at 320 px         | Typing and reading validation become unnecessarily difficult  |
| [VR-003](#vr-003--dark-dialogs-apply-a-pale-backdrop)                      | Moderate          | Dark dialogs apply a pale gray backdrop                                    | A small dialog brightens most of the dark screen              |
| [VR-004](#vr-004--identical-vote-prompts-do-not-show-progress)             | Moderate          | Duplicate answers produce identical sequential votes                       | A successful first tap looks ineffective                      |
| [VR-005](#vr-005--host-scaling-pushes-sparse-results-beyond-the-viewport)  | Moderate          | Host scaling makes a one-row scoreboard 1300 px tall in a 1000 px viewport | Next actions require scrolling through blank space            |
| [VR-006](#vr-006--a-word-fact-describes-a-different-meaning-of-the-answer) | Moderate, content | An Animal answer receives an album fact                                    | The educational card is disconnected from the played category |
| VR-007–010                                                                 | Minor             | Final-round guest guidance, two pluralization issues, avatar affordance    | Localized clarity and polish                                  |

No severity above Moderate is justified by this run: primary journeys completed, scrolling worked, and continuation controls remained reachable. All findings are **new / open**; these are review recommendations, not user-approved implementation decisions.

## Coverage

“Inspected” means actual rendered evidence was viewed by a visual reviewer. “Partial” identifies narrower evidence or states that were traversed but not captured in a settled frame.

| Surface / journey                             | Conditions and states                                                                                                           | Status              | Evidence / limits                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Home, first use                               | English dark desktop; English light phone; Hebrew light narrow phone; Arabic dark phone                                         | Inspected           | Captures 01, 11, 18, 38                                                                                                              |
| Other language homes                          | French dark tablet; Russian and Spanish dark phone                                                                              | Inspected           | 52–54; no full journeys in these three locales                                                                                       |
| Local player setup                            | Solo, two humans, robot, profile suggestions, long Hebrew name, missing-name error                                              | Inspected           | 02, 19–20, 55                                                                                                                        |
| Avatar picker                                 | Dark desktop open and settled recheck; selecting fox; Escape returns focus to Picture                                           | Inspected           | 03, 71; file upload not exercised                                                                                                    |
| Category setup                                | Presets, selected/unselected chips, Classic/single-category, Hebrew custom entry, too-long error, accepted custom category      | Inspected           | 04, 21–22, 43, 56–58                                                                                                                 |
| Timer/round/advanced setup                    | No timer, normal/fast choices, one/three rounds; advanced validation/language/facts; remote voting choices                      | Inspected           | 05–06, 23, 44                                                                                                                        |
| Solo full game                                | Ada; one round, Classic five categories, no timer, B; all five accepted; final 50                                               | Inspected           | 07–10; 08 captured an earlier typing frame, while 09 establishes all submitted answers                                               |
| Shared-screen game                            | Hebrew, two humans, handoff, default five fields, wrong letter, incomplete submission, two votes, shared answer and tied final  | Inspected           | 24–36                                                                                                                                |
| Live round settings                           | Hebrew 320 × 740, expanded settings, scroll/dismiss                                                                             | Partial             | 27–28; first frame catches transition clipping, settled/later frame contains title and Close; no persistent clipping defect asserted |
| Phone timed game / robot                      | Six categories including a longer custom title, timer progression, scrolling, automatic completion, robot results and word fact | Inspected / partial | 59–64; expiry overlay and bot-thinking transition were not captured before progression                                               |
| Learned words                                 | English empty, Hebrew one learned item after group vote                                                                         | Inspected           | 13, 37; dense library and removal not tested                                                                                         |
| Family leaderboard                            | English populated single-player row                                                                                             | Inspected           | 12; empty leaderboard, dense list and very large scores not covered                                                                  |
| Join form                                     | English phone, blank required-field errors, connection/loading, invalid-room recovery                                           | Inspected           | 14–17                                                                                                                                |
| Host lobby                                    | Arabic dark phone, opening, code/QR, empty and populated lobby                                                                  | Inspected           | 39–42; QR appearance inspected, camera scanning not performed                                                                        |
| Remote complete game A                        | Arabic dark; host phone, guest 1280 × 720; one category, one round, no timer, connected lobby through final scores              | Inspected           | 41–50; guest filenames ending “390” are inaccurate, actual guest image size is 1280 × 720                                            |
| Remote complete game B                        | English dark; host 1440 × 1000, guest verified 390 × 844; five categories, longer player name, complete entry/results/final     | Inspected           | 73–78; host continuation reached by scrolling                                                                                        |
| Leave/save/resume                             | Hebrew phone, leave confirmation, saved-game card, delete confirmation opened/cancelled, Resume clicked                         | Partial             | 66–69; 65 is pre-dialog; 69 still shows save list. AX confirmed resumed handoff, but no matching settled visual capture              |
| Returning home                                | Resume appeared in live accessibility state                                                                                     | Partial             | The intended home capture 66 actually shows the preceding leave dialog; do not treat it as home evidence                             |
| Host departure feedback                       | Guest final scores persisted after host returned home                                                                           | Partial             | 51 not proof of active-round disconnection behavior                                                                                  |
| Keyboard                                      | Input focus styling; Escape closes avatar and returns focus                                                                     | Partial             | 08, 26, 71 plus live AX observations; full keyboard/focus-trap audit not performed                                                   |
| Real phones, keyboard/insets                  | No physical mobile device or software keyboard                                                                                  | Blocked             | Browser resizing cannot establish platform keyboard/inset behavior                                                                   |
| Camera / file upload / severe network failure | Permissions and external inputs not needed for this review                                                                      | Skipped             | QR camera, custom image upload, TURN fallback and active-room disconnect/reconnect remain untested                                   |
| Motion / reduced motion / zoom                | Some transition frames and timer sequence                                                                                       | Partial / skipped   | No systematic motion recording, reduced-motion setting or 200% text zoom test                                                        |
| Maximum density                               | Up to two local humans and one robot fixture; one remote guest                                                                  | Partial             | Eight players, multiple remote guests/voting quorum, many saves, very large scores not covered                                       |

Full [evidence index](.visual-review/runs/20260919T043318Z/evidence-index.json) records all 78 captured artifacts, their actual encoded image sizes and UTC timestamps. [Capture manifest](.visual-review/runs/20260919T043318Z/capture-manifest.json) records measured CSS dimensions and intended context for coordinator captures. It is the **rendered content**, not a filename, that determines coverage.

## Navigation recipes

| Recipe                       | Preparation and actions                                                                                                                                                                                                               | Arrival cue                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| R1 — short solo game         | Home → New Game → name Ada / fox avatar → Next → Classic → Next → No timer → rounds down to 1 → Start. Use words beginning with the displayed random letter; original was B: Bear, Bread, Berlin, Ben, Book. Done → See scores        | Five accepted 10-point answers, total 50, final winner/actions                                        |
| R2 — duplicate-answer voting | Hebrew light → New Game → two humans named אלכסנדר הגדול and נועה → Classic → No timer, 1 round → each human submits the same previously unknown word in Animal, leaves others empty, confirms Done. Original letter ה and word המצאה | Same question displayed twice after the first Yes; both receive shared 5 points after two Yes choices |
| R2 fixture caveat            | The original word was learned after acceptance. On rerun use fresh local test storage or a different same-letter unknown word; do not assume המצאה will prompt again                                                                  | Two pending unknown entries, not preaccepted learned answers                                          |
| R3 — custom category         | Hebrew → setup step 2 → 320 × 740 → scroll bottom → type a category; long sample דברים שלוקחים לטיול ארוך במיוחד triggers validation; shorter דברים לטיול משפחתי is accepted                                                          | Cramped input/error row, then selected custom chip                                                    |
| R4 — save/resume             | Local human plus robot, 3 rounds → start a round → Back → confirm leave → Home Resume → inspect saved card → open Delete then Cancel → Resume                                                                                         | Card includes names, round count and timestamp; live AX returns to handoff                            |
| R5 — host/guest              | New Game → Phones join in → wait for code/QR. Open a second tab using the displayed `?join=CODE`, enter guest name and Join. Codes in this run were ephemeral; never reuse them                                                       | Host joined count and guest “You're in” lobby                                                         |
| R6 — final-round remote      | Host continues setup → choose 1 round, no timer → Start → guest fills answers → Done → inspect guest results before host See scores                                                                                                   | Guest says next round starts on big screen while round count is 1 of 1                                |
| R7 — host height             | Complete remote one-player game → host See scores; measure 1440 × 1000 then scroll                                                                                                                                                    | Scoreboard document is 1300 px tall; replay/home actions reached below blank area                     |
| R8 — dark backdrop           | English dark → New Game → Picture; allow transition to settle → Escape                                                                                                                                                                | Pale surround around dark dialog; Escape returns focus to Picture                                     |
| R9 — join recovery           | Home → Join Game → submit blank → enter nonexistent room ZZZZZZ and a test name → Join                                                                                                                                                | Inline errors, then Joining, then room-not-found card with retry/home                                 |

No direct store injection or fabricated UI state was used. Random letters and robot answers make exact data nondeterministic; use the displayed letter and record new answers when reproducing.

## Visual inventory and strengths

- **Coherent color and component language.** Cream/light and cocoa/dark surfaces, teal selected controls, pink primary actions, rounded cards and lower-edge button shadows create a friendly, visibly interactive game. [Home desktop](.visual-review/runs/20260919T043318Z/evidence/01-home-dark-desktop.png) and [mobile](.visual-review/runs/20260919T043318Z/evidence/11-home-light-mobile.png).
- **Strong action hierarchy.** New Game/Join, Next, Start and Done are easy to find. Choice cards use a strong selected border; categories combine icons with text. [Categories](.visual-review/runs/20260919T043318Z/evidence/04-rules-dark-desktop.png).
- **Readable RTL layout.** Hebrew/Arabic headers, cards and controls mirror sensibly; tested longer player names and category labels remain contained. The room code stays readable within Arabic context. [Arabic lobby](.visual-review/runs/20260919T043318Z/evidence/40-host-lobby-arabic-dark-390.png).
- **Useful error and recovery presentation.** Join errors use field boundaries and nearby messages; room failure offers retry and Home. [Validation](.visual-review/runs/20260919T043318Z/evidence/15-join-validation-light-mobile.png), [recovery](.visual-review/runs/20260919T043318Z/evidence/17-join-result-light-mobile.png).
- **Score states use text as well as color.** Accepted answers and shared-word scores are distinguishable by labels and numbers. [Accepted review](.visual-review/runs/20260919T043318Z/evidence/09-review-dark-desktop.png), [shared review](.visual-review/runs/20260919T043318Z/evidence/34-shared-review-hebrew-390.png).
- **The sticky letter/timer is worth preserving.** At the bottom of a six-category phone round, the timer and letter remain visible and the completion action is reachable without covering an input. [Scrolled round](.visual-review/runs/20260919T043318Z/evidence/61-round-bottom-timer-hebrew-390.png).
- **Guest final results are compact.** Name, total, winner message and Home read as one group. This is a useful reference when improving host results. [Guest final](.visual-review/runs/20260919T043318Z/evidence/78-guest-final-scores-mobile.png).

Measured examples: primary text 17 px, headings 22 px, chips 14 px; tested chips were 44 px tall, primary controls about 48–53 px. These are sampled values, not a comprehensive accessibility audit. The design scheme explicitly permits 44 px chips. Contrast ratios and actual glyph fallback faces were not measured.

## Detailed findings

### VR-001 — Five-category rounds exceed the phone viewport

- **Kind / status / disposition:** Observed layout/usability issue / new / open.
- **Severity / confidence:** Moderate / high.
- **Conditions:** Local Classic round, Hebrew light; CSS 390 × 844 and 320 × 740, keyboard closed.
- **Observation / impact:** Four complete answer fields fit at 390 × 844; only three complete fields fit at 320 × 740. The fifth field and Done are below the initial fold. This conflicts with the explicit five-fields-per-phone design objective and adds scrolling during timed entry. It does not prevent play.
- **Reproduce:** R1 or R2 with Classic defaults; view the top before typing.
- **Evidence:** [390 viewport](.visual-review/runs/20260919T043318Z/evidence/31-round-hebrew-390.png), [320 viewport](.visual-review/runs/20260919T043318Z/evidence/25-round-hebrew-320.png). [Six-category measured fixture](.visual-review/runs/20260919T043318Z/round-measurements.json) is supplemental, not the proof of the five-category case.
- **Verified cause:** Card vertical padding/borders and fixed letter/header allocations consume height; [Card.svelte](src/lib/ui/Card.svelte), line 14; [Round.svelte](src/screens/Round.svelte), lines 623 and 650; [App.svelte](src/App.svelte), line 137. Source arithmetic is detailed in discovery notes and is not presented as an exact rendered measurement.
- **Correction:** Create a compact phone arrangement for the letter/header and label/input cards using approved spacing tokens. Preserve clear labels, usable fields and sticky timing context.
- **Acceptance:** Five default fields fit within 390 × 844 with keyboard closed; validate the agreed minimum 320 × 740 layout too. Done remains discoverable/reachable without obscuring a field. Check English and Hebrew with valid and wrong-letter text.

### VR-002 — Hebrew custom-category entry collapses to a sliver

- **Kind / status / disposition:** Observed layout defect / new / open.
- **Severity / confidence:** Moderate / high.
- **Conditions:** Hebrew light, setup step 2, CSS 320 × 740.
- **Observation / impact:** The input is 69.47 px wide including borders; its 65 px client width minus 32 px inline padding leaves about **33 px for editable text**. The adjacent action occupies 195.53 px. Placeholder/entered text is clipped and a long validation message wraps into a narrow vertical column.
- **Reproduce:** R3, including too-long input.
- **Evidence:** [Recheck](.visual-review/runs/20260919T043318Z/evidence/56-custom-category-recheck-hebrew-320.png), [validation](.visual-review/runs/20260919T043318Z/evidence/57-long-custom-category-hebrew-320.png), [DOM measurements](.visual-review/runs/20260919T043318Z/custom-category-measurements.json).
- **Verified cause:** Unwrapped flex row, field receives remaining space, long Hebrew translation used for both placeholder and button. [NewGame.svelte](src/screens/NewGame.svelte), lines 561 and 912; [Hebrew strings](src/lib/i18n/he.ts), line 86.
- **Correction:** Stack the input and action at narrow widths, or shorten the action and reserve a practical input width; let its error use the full row.
- **Acceptance:** A normal category label is readable while editing at 320 px; validation forms a readable sentence, action text is complete, and neither control overflows. Recheck all six translations.

### VR-003 — Dark dialogs apply a pale backdrop

- **Kind / status / disposition:** Observed theme consistency defect / new / open.
- **Severity / confidence:** Moderate / high.
- **Conditions:** English dark desktop avatar picker; stable open state rechecked.
- **Observation / impact:** The dark dialog sits over a pale gray wash covering most of the formerly dark page. This creates a large brightness change and weakens the dark-theme experience.
- **Reproduce:** R8.
- **Evidence:** [Initial dialog](.visual-review/runs/20260919T043318Z/evidence/03-avatar-picker-dark-desktop.png), [settled recheck](.visual-review/runs/20260919T043318Z/evidence/71-avatar-dark-settled-desktop.png).
- **Verified shared cause:** [Modal.svelte](src/lib/ui/Modal.svelte), line 77, derives its overlay from 50% current text color; dark text token is nearly white in [tokens.css](design/exports/tokens.css), line 94. This is shared modal styling, although only the dark avatar state was directly rechecked.
- **Correction:** Define/use an approved backdrop token that dims content appropriately in both themes.
- **Acceptance:** Dark modal opening keeps the surround dark and the panel dominant; light-theme separation remains clear. Check avatar, confirmation, settings and vote dialogs; preserve Escape dismissal/focus restoration.

### VR-004 — Identical vote prompts do not show progress

- **Kind / status / disposition:** Observed interaction-feedback problem / new / open.
- **Severity / confidence:** Moderate / high.
- **Conditions:** Two shared-screen humans submit the same unknown word/category; Hebrew, 390 × 844.
- **Observation / impact:** After Yes, an identical question with identical Yes/No actions remains. No submitter or queue position distinguishes the second required decision. A successful first click looks like it failed.
- **Reproduce:** R2. The original word is now learned, so recreate an unknown entry as described in the recipe.
- **Evidence:** [First vote](.visual-review/runs/20260919T043318Z/evidence/32-vote-hebrew-390.png), [after first Yes](.visual-review/runs/20260919T043318Z/evidence/33-shared-review-hebrew-390.png), [after second Yes](.visual-review/runs/20260919T043318Z/evidence/34-shared-review-hebrew-390.png); live interaction recorded two distinct activations.
- **Verified cause:** [Review.svelte](src/screens/Review.svelte), lines 104/197/280/404, queues unknown answers individually, advances one at a time, and displays only word/category without submitter/progress.
- **Correction:** Show answer owner and accurate progress, or consolidate identical word/category decisions if that matches the intended voting rule.
- **Acceptance:** With two identical unknown submissions, the first activation visibly advances the process and explains any remaining decision. Both answers receive consistent, deliberate treatment; no ambiguous repeat-click appearance.

### VR-005 — Host scaling pushes sparse results beyond the viewport

- **Kind / status / disposition:** Observed layout defect / new / open.
- **Severity / confidence:** Moderate / high.
- **Conditions:** Remote host, one guest; Arabic narrow host and English desktop.
- **Observation / impact:** A one-row host scoreboard at CSS 1440 × 1000 has document scrollHeight **1300 px**. Large empty space separates the score from the winner/actions. Narrow host review and scores likewise put continuation below the initial fold despite sparse content. Scrolling reaches the controls; they are not missing.
- **Reproduce:** R7.
- **Evidence:** [Sparse host review](.visual-review/runs/20260919T043318Z/evidence/48-remote-host-review-arabic-390.png), [sparse host scores](.visual-review/runs/20260919T043318Z/evidence/49-remote-host-scores-arabic-390.png), [scrolled reachable actions](.visual-review/runs/20260919T043318Z/evidence/77-host-scores-actions-recheck.png). CSS viewport/scroll-height stored in capture manifest for 77.
- **Verified cause:** [App.svelte](src/App.svelte), lines 43/134/140–143, applies `zoom: 1.3` to the host shell with a `100dvh` minimum, without viewport compensation or a mobile exception. [Scoreboard.svelte](src/screens/Scoreboard.svelte), line 241, lets the scores section consume the extra height.
- **Correction:** Use approved host typography/spacing tokens or a height-aware scale arrangement; keep viewport-sized layout independent of content enlargement.
- **Acceptance:** With one guest and short results, host review continuation and score actions fit the initial 390 × 844 and 1440 × 1000 viewports. Long results can scroll naturally. Preserve readable host text and avoid shrinking control targets.

### VR-006 — A word fact describes a different meaning of the answer

- **Kind / status / disposition:** Observed content-relevance issue surfaced during visual review / new / open.
- **Severity / confidence:** Moderate / high for this occurrence; recurrence across other words untested.
- **Conditions:** English remote game, Animal answer “Elephant,” facts enabled.
- **Observation / impact:** The “Did you know?” card describes a 2003 studio album rather than the animal that was played. The card presents this as educational context for the answer without clarifying the change in meaning.
- **Reproduce:** Use R5 with an E round, submit Elephant under Animal, keep word facts on. The external fact response may vary, so this exact result is not guaranteed on every rerun.
- **Evidence:** [Fact and standings](.visual-review/runs/20260919T043318Z/evidence/76-host-review-bottom-english.png); Animal/Elephant appears in the same result journey, [review top](.visual-review/runs/20260919T043318Z/evidence/75-host-review-english-dark-desktop.png).
- **Cause:** Unknown; word-sense/entity disambiguation is a hypothesis. No fact-service implementation or external factual audit was performed.
- **Correction:** Match facts to the category/meaning or suppress low-confidence extras; make any intentionally different meaning explicit.
- **Acceptance:** Animal/Elephant facts concern the played animal, or no fact is shown. Test ambiguous names/objects with cached/repeatable responses as part of a separate content fix.

### VR-007 — Final-round guests are told another round is coming

- **Kind / status / disposition:** Observed state-copy defect / new / open.
- **Severity / confidence:** Minor / high.
- **Conditions:** Remote game with exactly one round; Arabic desktop guest and English phone guest.
- **Observation / impact:** Guest review says “The next round starts on the big screen” while the game is Round 1 of 1. This misstates what the guest is waiting for.
- **Reproduce:** R6.
- **Evidence:** [Arabic final-round review](.visual-review/runs/20260919T043318Z/evidence/47-remote-guest-waiting-arabic-390.png), [English phone recheck](.visual-review/runs/20260919T043318Z/evidence/74-guest-results-english-dark-mobile.png).
- **Verified cause:** [Join.svelte](src/screens/Join.svelte), line 500, renders `join.results.next` unconditionally; roundIndex/roundCount already exist in the result payload.
- **Correction / acceptance:** Show final-results or neutral host-continuation guidance for the final round; keep next-round wording for nonfinal finite/endless rounds. Verify both language directions.

### VR-008 — Single leaderboard counts use plural nouns

- **Kind / status / disposition:** Observed copy defect / new / open.
- **Severity / confidence:** Minor / high.
- **Conditions:** English leaderboard after Ada's first completed win.
- **Observation:** “1 games · 1 wins” appears beneath the name.
- **Evidence / reproduce:** Complete R1 → Home → Family leaderboard; [capture](.visual-review/runs/20260919T043318Z/evidence/12-leaderboard-light-mobile.png).
- **Cause:** Exact implementation not investigated.
- **Correction / acceptance:** Localize singular/plural count phrases; one game and one win render naturally, while 0 and larger counts retain appropriate forms without wrapping into the score column.

### VR-009 — Hebrew tied winners use singular winner wording

- **Kind / status / disposition:** Observed localization defect / new / open.
- **Severity / confidence:** Minor / high.
- **Conditions:** Hebrew two-player tie, 5 points each.
- **Observation:** Both players have crowns and equal scores, but the combined winner line ends with singular “ניצח/ה!”.
- **Evidence / reproduce:** R2 through final scores; [tied result](.visual-review/runs/20260919T043318Z/evidence/36-tied-scoreboard-hebrew-390.png).
- **Cause:** Exact implementation not investigated.
- **Correction / acceptance:** Use natural plural winner wording, such as “ניצחו!”, for multiple winners; preserve correct single-winner treatment and wrapping for longer name lists.

### VR-010 — The initial avatar control looks like a decorative disc

- **Kind / status / disposition:** Usability observation / new / open.
- **Severity / confidence:** Minor / medium for discoverability, high for appearance and actual click behavior.
- **Conditions:** Unnamed player in New Game or Join.
- **Observation / impact:** A plain teal circle has no visible picture/edit cue. It opens a substantial avatar chooser when clicked, but a first-time player may not recognize it as interactive.
- **Evidence / reproduce:** [New Game](.visual-review/runs/20260919T043318Z/evidence/02-new-game-dark-desktop.png), [Join](.visual-review/runs/20260919T043318Z/evidence/14-join-light-mobile.png), and the chooser in 03. The live control has the accessible name Picture.
- **Cause:** Unknown; accessible naming exists, so this is a visible-affordance issue rather than an assertion of missing accessibility semantics.
- **Correction / acceptance:** Show an approved person/picture/edit symbol or brief visible label in the empty state. A new player should be able to infer picture selection before entering a name. Preserve the populated avatar's simplicity.

## Prioritized recommendations and shared corrections

| Priority | Work                                    | Affected findings | Verified sharing / expected outcome                                                                              |
| -------- | --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1        | Correct host shell viewport sizing      | VR-005            | Verified common App rule affects host round/review/scores; short screens no longer require blank-space scrolling |
| 1        | Reflow custom-category input and errors | VR-002            | Verified setup row/translation interaction; narrow RTL text entry becomes practical                              |
| 1        | Compact default phone round             | VR-001            | Verified card/header allocations; preserve sticky timer and minimum target sizes                                 |
| 2        | Improve vote identity/progress          | VR-004            | Verified shared review queue/prompt; duplicate decisions become understandable                                   |
| 2        | Use theme-appropriate modal scrim       | VR-003            | Verified shared Modal rule; recheck every overlay and both themes                                                |
| 2        | Make word facts category-aware          | VR-006            | Cause unverified; content relevance should gate display                                                          |
| 3        | Correct state-aware and pluralized copy | VR-007–009        | Final-round cause verified; pluralization implementations not investigated                                       |
| 3        | Clarify empty avatar affordance         | VR-010            | Shared symptom in setup/join; common component not investigated                                                  |

## Optional refinements and unresolved observations

These are **suggestions or unverified questions**, not additional confirmed defects:

- Group the local solo winner sentence nearer the score; the large desktop gap in capture 10 is an aesthetic composition opportunity distinct from the verified remote host overflow.
- Compact categories where every answer is blank, or surface a concise total/continuation summary earlier; current results remain readable and scrollable.
- The narrow Hebrew word-checking dropdown looks crowded in 27–28. Recheck the settled selected label and arrow before claiming specific clipped characters.
- Consider a concise first-use example (“an animal beginning with B”), explicit Sound on/off wording, and stronger enabled appearance for muted dark chips. No contrast failure was measured.
- Hebrew glyph styling differs from Latin. The computed stack is `Nunito, "Varela Round", "Segoe UI", system-ui, sans-serif`; this does not establish which fallback draws each glyph. Do not infer a broken font from family declarations alone.
- Saved-game timestamps show an English AM/month-first format inside Hebrew (67/69). Decide whether date formatting follows UI locale or browser locale, and isolate bidirectional numeric text accordingly.
- Empty-host Next is **enabled**, not incorrectly styled as disabled. Clicking it produces the expected no-guests validation. The initial reviewer suspicion of a disabled-style defect was withdrawn.
- Settings/delete-dialog softness or clipping in initial captures can reflect entrance animation. No persistent defect is established from those frames.
- Host/guest results and online facts were exercised with local test data. This does not certify dictionary correctness, network reliability, scoring fairness, or accessibility conformance.

## Continuity and dispositions

No prior root `VISUAL_REVIEW.md` existed. This run establishes the initial evidence baseline; no screenshot regression comparison or “resolved” claim is made.

| Finding IDs   | Observation status | Disposition | Decision provenance                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VR-001–VR-010 | Verified in source | Fixed       | All ten causes confirmed and fixed in the working tree, 2026-09-19 (Claude Code). Browser recheck at 390 × 844: five fields plus Done fit (VR-001), custom-category input 266 px with an 84 px action (VR-002), dark scrim is `--color-scrim` at 60 % (VR-003), empty avatar shows a face plus pencil badge (VR-010); the remaining fixes are covered by unit tests and the six verify gates. Not yet re-captured as evidence. |

## Human notes and decisions

<!-- visual-review:human-notes:start -->
<!-- visual-review:human-notes:end -->

## Setup, limitations, and artifacts

The first sandboxed launch failed with `esbuild spawn EPERM`. The same documented Vite command succeeded after approved execution outside that restriction. No package/config workaround was needed; the three-attempt/ten-minute setup limit was not reached. The local UI and real PeerJS connection both loaded successfully. This was development mode, which the project documents as excluding review traffic from production analytics.

Screenshots are immutable capture-tool outputs. Most bytes are JPEG despite the retained `.png` filenames; MIME and encoded dimensions are recorded in the evidence index. Some scrollable-page captures are proportionally smaller than the CSS viewport (for example 375 × 812 from 390 × 844). Claims of exact control widths use DOM measurements, not scaled screenshot pixels.

Some captures precede the intended transition: 08 is partly typed, 33 is still voting, 47 is already results, 62/70 are post-timeout review, 65 is pre-leave-dialog, 66 shows the leave dialog, and 69 still shows the save list. These differences are explicitly reflected in coverage. Transient frame differences were not classified as layout regressions.

The review did not change application code and did not run build/lint/type/unit-test suites. Validation here consisted of live journeys, image inspection, focused DOM measurement, observed-source cause investigation, source-fingerprint checks and artifact/link integrity checks. The report is a visual baseline, not a full functional or accessibility test result.

Artifacts:

- [Checkpoint](.visual-review/runs/20260919T043318Z/checkpoint.json)
- [Evidence index](.visual-review/runs/20260919T043318Z/evidence-index.json)
- [Capture manifest](.visual-review/runs/20260919T043318Z/capture-manifest.json)
- [Fresh visual reviewer](.visual-review/runs/20260919T043318Z/reviewers/fresh-visual.md)
- [Responsive visual reviewer](.visual-review/runs/20260919T043318Z/reviewers/responsive-visual.md)
- [Discovery and verified causes](.visual-review/runs/20260919T043318Z/reviewers/discovery.md)
- [Artifact verification](.visual-review/runs/20260919T043318Z/reviewers/verification.md) — report links, all 78 captures, 10 finding records and all 11 tracked-source fingerprints passed; no unexpected tracked-file changes.

Reviewer notes retain their intermediate hypotheses and narrower assignments. The synthesized finding list and corrected coverage above are authoritative for this run. A future recheck should reproduce the listed conditions, capture settled states, and preserve these stable IDs and human decisions.
