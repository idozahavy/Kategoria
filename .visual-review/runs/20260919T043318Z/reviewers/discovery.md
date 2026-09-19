# Review surface discovery

Discovery performed from repository files only; no UI inspection or app execution by this helper.

## Launch and environment

- Launch: `npm run dev -- --host 127.0.0.1 --port 5173` (`package.json:8`). `npm run dev:lan` binds all interfaces on 5180 (`package.json:9`). Use development mode so local review visits do not enter production analytics (`README.md:62`).
- No TCP listener was found on 5173, 5174, 5180, or 4173 during discovery. The root agent may have launched one since this snapshot.
- `README.md:19` documents npm install then npm run dev. `package.json:13` offers Svelte type checking and `package.json:14` Vitest tests. No browser/E2E/visual-review fixtures were found by filename searches.
- No root `CODE_MAP.md`, `docs/RECIPES.md`, or previous `VISUAL_REVIEW.md` existed at discovery time. There are no prior report dispositions, findings, or user notes to carry forward.
- Applicable repository rules are in `AGENTS.md:7` and `AGENTS.md:13`; actual available skills are `.agents/skills/design-system/SKILL.md` and `.agents/skills/code-conventions/SKILL.md`. The older `.Codex` references in AGENTS differ from the provided skill catalog.
- Read `CODESTYLE.md` before code review; only document output created. No application file edits, tests, server starts, screenshots, or browser mutations performed by this helper.

## Navigation, languages, and appearance

- The app has no route-based UI router: screen store controls nine screens (`src/App.svelte:109`, `src/lib/types.ts:150`). Direct navigation to `/round` does not independently set up game state. UI navigation is the normal review entry path.
- `?join=CODE` opens Join with the room code prefilled (`src/App.svelte:93`, `src/screens/Join.svelte:77`).
- Home links New Game, Join, conditionally Resume, Leaderboard, Learned Words, language choices and theme controls (`src/screens/Home.svelte:32`). Resume is shown only when an unfinished local game exists (`src/screens/Home.svelte:19`).
- Supported packs are English, Hebrew, Spanish, Arabic, French and Russian (`src/lib/i18n/index.ts:12`). Hebrew and Arabic are RTL (`README.md:12`). UI language and game language are independent (`src/screens/NewGame.svelte:192`).
- Theme is light or dark; stored choice wins, otherwise system color scheme (`src/lib/theme.ts:6`). Home chips expose both. UI language persists under `categories-ui-language`; theme under `categories-theme` (`src/lib/i18n/index.ts:33`, `src/lib/theme.ts:8`).
- The ordinary shell is centered and capped at 480 px; remote host round/review/scoreboard shell caps at 560 px with enlarged type (`src/App.svelte:41`, `src/App.svelte:133`). Desktop whitespace outside this phone-oriented shell is intentional.

## Complete screen and overlay inventory

1. Home: title/hero, primary actions, language/theme choices, sound toggle, Leaderboard and Learned Words (`src/screens/Home.svelte:28`).
2. New Game step 1: local/phones-join mode tiles; local player name, avatars, profile suggestions, add player, bot; remote room-opening, failure/retry, code, QR, empty lobby, populated lobby (`src/screens/NewGame.svelte:394`). Up to eight local players. Avatar picker modal at `src/screens/NewGame.svelte:724`.
3. New Game step 2: classic or single-category mode; preset category packs, category choices and custom category entry (`src/screens/NewGame.svelte:499`).
4. New Game step 3: game language, remote voting location, scoring, timer, rounds/endless, expandable advanced word-validation and fact settings (`src/screens/NewGame.svelte:574`, `src/screens/NewGame.svelte:622`, `src/screens/NewGame.svelte:653`). Defaults: classic, three rounds, two-minute timer, bundled offline validation (`src/screens/NewGame.svelte:166`).
5. Round: local player handoff (when two or more players), bot-thinking handoff, letter/timer, category answer cards, wrong-letter hint and Done (`src/screens/Round.svelte:372`). Host variant shows shared categories, player completion chips and Finish Now (`src/screens/Round.svelte:441`). Overlays: leave confirmation, incomplete-submit confirmation, time up, settings (`src/screens/Round.svelte:480`).
6. Review: checking spinner; unknown-word vote modal; result cards by category with valid/shared/invalid answer styles, optional fact, standings, Next Round and Finish (`src/screens/Review.svelte:296`). Shared-screen voting has yes/no choices; device voting shows phone progress (`src/screens/Review.svelte:380`).
7. Scoreboard: standings; completed game has winner text/confetti, one more round, play again, home; ongoing game has next round, auto-next cancellation if enabled and end game (`src/screens/Scoreboard.svelte:151`).
8. Resume: empty state, saved-game cards, resume/delete, delete confirmation modal (`src/screens/Resume.svelte:76`, `src/screens/Resume.svelte:131`).
9. Learned Words: empty or language/category grouped learned-word library (`src/screens/LearnedWords.svelte:45`). Leaderboard: empty or persisted player records (`src/screens/Leaderboard.svelte:33`).
10. Join has internal phases form, connecting, lobby, entry, waiting, vote, voted, results, scores, error (`src/screens/Join.svelte:356`). Includes scanner, avatar and incomplete-submit modals (`src/screens/Join.svelte:530`). Test empty code/name form errors, unknown-room error and host disconnect as practical error-state coverage.

## Practical UI recipes

- Fast solo run: Home > New Game > leave one anonymous player or enter a name > Next > keep default categories > Next > timer off, rounds down to one; optionally advanced validation None for predictable results > Start. Fill or leave answer fields, press Done, confirm incomplete submission if necessary, inspect Review, Finish to Scoreboard. Solo anonymous player is allowed (`src/screens/NewGame.svelte:285`). Named player completion populates Leaderboard.
- Save/Resume: during a local active round, Back > confirm leave. Home should reveal Resume. Inspect save card then resume; use only review-created saves for delete checks.
- Shared-screen multiplayer: add a second named player in setup; names must be nonempty and unique (`src/screens/NewGame.svelte:288`). Enter answers for player one > submit > handoff > player two > submit. Use an unfamiliar same-letter word with bundled validation to trigger group vote. A bot does not count as a second human for group voting (`src/screens/Review.svelte:53`, `src/screens/Review.svelte:104`).
- Remote: host New Game > Phones join, wait for room code/QR; separate guest browser context/tab opens `?join=CODE`, supplies name/avatar and joins. Host cannot advance without at least one guest (`src/screens/NewGame.svelte:286`). Set one round/timer off for review. Host sees shared TV state; guest sees answer/voting/results state. Two guests provide richer completion and voting coverage.
- Remote network caveat: PeerJS public signaling is required. Local dev lacks the TURN credentials function and silently uses STUN only; same-network connections should work, restrictive networks may fail (`README.md:37`, `README.md:58`). Remote runtime failure should be reported as a limitation unless visual defect independently observed.
- QR scanner requires camera availability and permission; native permission UX is environment-dependent (`src/screens/Join.svelte:367`).
- Existing unit helpers mock PeerJS, storage and TURN; they are not runnable UI fixtures (`src/lib/p2p.test-helpers.ts:26`, `src/lib/p2p.test-helpers.ts:97`). Game-state examples exist in `src/lib/game.test.ts:101`; browser state injection was neither needed nor performed.

## Design evaluation guidance

- Source of truth is `design/scheme.md`, `design/tokens.json`, `design/components.json`; comparisons: `design/references/direction-a.html`, `design/references/refine-5-components.html`, `design/references/refine-6-states-dark.html` (`.agents/skills/design-system/SKILL.md:9`).
- Candy Pop: teal on warm cream, friendly Nunito, chunky tactile buttons, cozy density; warm cocoa dark theme (`design/scheme.md:8`). Five category inputs should fit a phone screen in the intended round density (`design/scheme.md:11`). Note Vite's own comment says Arabic/Hebrew fall back to system fonts (`vite.config.ts:31`), despite the scheme claiming Hebrew Nunito support.
- Required: body contrast at least 4.5:1, body text at least 16 px (17 intended), controls at least 48 px; scheme explicitly permits chips at 44 px (`design/scheme.md:20`) while skill broadly says 48 px. Treat that chip exception carefully when reporting.
- Logical CSS and RTL parity are hard requirements. Scores/timers use tabular numerals. Minimal distraction: roughly three primary actions, no animation during typing/thinking (`design/scheme.md:19`, `design/scheme.md:23`).
- Feedback/celebration motion is springy 200–350 ms. Empty/loading/error patterns should use readable friendly wording and an alternative action (`design/scheme.md:13`). Reduced-motion global handling exists (`src/app.css:47`), plus modal handling (`src/lib/ui/Modal.svelte:110`); verify rendered behavior rather than infer from code.
- Existing focus-visible styling is at `src/app.css:32`. Modal max width 360 px at `src/lib/ui/Modal.svelte:88`; narrow layouts and focus handling are useful coverage points.

## Coverage status and limits

This is a code-based navigation inventory, not a visual finding report. No claim above certifies screenshots, responsive layouts, keyboard interactions, server startup, network access, real room joining or motion behavior. Root reviewer should distinguish visual evidence from these expected states. No prior visual report was found. Relevant memory search returned no hits and no memory-derived project facts were used.

## Source context for five observed symptoms

Follow-up from root review, September 19: root supplied the observed visual symptoms below. This helper inspected the corresponding source only; no application edits or independent screenshots were made.

### 1. Default five-category round overflows 390x844 and 320x740

Verified source contribution: each category uses the generic Card with 16 px padding on all sides and 2 px borders (`src/lib/ui/Card.svelte:11`, `src/lib/ui/Card.svelte:14`, `design/exports/tokens.css:39`, `design/exports/tokens.css:51`). The header has an 8 px bottom margin (`src/screens/Round.svelte:688`); its 22 px emoji inherits body line-height 1.5, implying about 33 px header line height (`src/screens/Round.svelte:691`, `src/app.css:12`, `design/exports/tokens.css:68`, `design/exports/tokens.css:78`). Input has a 48 px minimum and 12 px block padding (`src/lib/ui/TextInput.svelte:59`, `src/lib/ui/TextInput.svelte:65`). A card therefore has an approximate source-derived minimum of 125 px before errors or wrapping. Five cards and four 12 px gaps consume about 673 px (`src/screens/Round.svelte:650`).

Additional verified space consumers: shell has 16 px padding and 16 px item gaps (`src/App.svelte:137`); top bar wraps a 48 px control with 8 px padding (`src/lib/ui/TopBar.svelte:39`, `src/lib/ui/TopBar.svelte:48`); letter tile defaults to 96 px with 8 px block padding on its row (`src/lib/ui/LetterTile.svelte:2`, `src/screens/Round.svelte:623`); Done uses the 48 px minimum Button (`src/lib/ui/Button.svelte:31`) after the cards in normal document flow (`src/screens/Round.svelte:476`). Those elements together imply roughly 977 px minimum total height, not a runtime bounding-box measurement. No compact height-dependent variant is present in these rules. The letter header is explicitly sticky to support scrolling (`src/screens/Round.svelte:614`). The observed overflow is explained by these fixed vertical allocations; it conflicts with the scheme goal that five inputs fit one phone screen (`design/scheme.md:11`). Exact rendered heights remain the screenshot/DOM reviewer's evidence.

### 2. Hebrew custom-category input cramped at 320 px

Verified source contribution: the row places TextInput and Button beside each other (`src/screens/NewGame.svelte:561`); it is flex with an 8 px gap and has no wrapping or narrow-width stacking rule (`src/screens/NewGame.svelte:912`). Only the field is assigned flex:1 (`src/screens/NewGame.svelte:917`). Both placeholder and button use the same translation key (`src/screens/NewGame.svelte:564`, `src/screens/NewGame.svelte:571`); the Hebrew translation is the long phrase 'הוספת קטגוריה משלכם' (`src/lib/i18n/he.ts:86`). Button adds 24 px inline padding per side (`src/lib/ui/Button.svelte:33`, `design/exports/tokens.css:40`); input adds 16 px inline padding per side (`src/lib/ui/TextInput.svelte:66`). At 320 px the shell leaves 288 px for this row; 88 px is consumed by button/input horizontal padding and row gap alone. The remaining text-area allocation depends on the browser's intrinsic flex sizing and font metrics. The long sibling label plus unstacked row are verified contributors; exact width distribution is a runtime measurement, not inferred fact.

### 3. Dark avatar modal makes the page pale gray

Verified direct cause: every Modal overlay mixes the current text color at 50% with transparency (`src/lib/ui/Modal.svelte:77`). In dark theme that text token is nearly white #F5EDE7 (`design/exports/tokens.css:94`), so the backdrop deliberately composites a pale translucent layer over the dark page. This is shared Modal behavior, not an avatar-specific override. The dialog itself correctly uses the surface token (`src/lib/ui/Modal.svelte:85`).

### 4. Duplicate unknown answers require two identical Yes dialogs

Verified direct cause: Review builds its pending list per AnswerEntry (`src/screens/Review.svelte:82`), checks all entries, and pushes every unknown answer into votes individually (`src/screens/Review.svelte:99`, `src/screens/Review.svelte:104`). There is no deduplication by normalized word plus category. `advanceVote` selects queue[0] (`src/screens/Review.svelte:174`); `castVote` removes exactly one entry (`src/screens/Review.svelte:197`) and advances. Accepting learns the word asynchronously but does not re-check or remove equivalent queued entries (`src/screens/Review.svelte:193`). The question interpolates only word and category (`src/screens/Review.svelte:280`), while the shared-screen branch shows only Yes/No (`src/screens/Review.svelte:404`). It contains neither current submitter identity nor queue position/count. Therefore identical player answers yield visually identical sequential dialogs. Denial marks only the current player's entry invalid (`src/screens/Review.svelte:195`), so independently deciding duplicates can also produce inconsistent decisions; this latter possibility was source-inspected, not runtime-tested here.

### 5. Host Next is bright pink before guests join

Correction to supplied premise: Next is enabled, not a disabled control rendered incorrectly. Its disabled expression only applies to step 2 with no chosen/pending category (`src/screens/NewGame.svelte:711`), so step 1 remote lobby always shows the enabled accent variant (`src/screens/NewGame.svelte:709`). Guest count is checked only when Next runs validation (`src/screens/NewGame.svelte:286`, `src/screens/NewGame.svelte:302`), producing the no-guests error without advancing. Genuine disabled buttons are neutral border/muted text (`src/lib/ui/Button.svelte:77`). Thus a potential usability finding is an enabled-looking CTA that cannot advance and relies on click-time error feedback; it must not be labeled a disabled-style defect. Whether waiting-state copy sufficiently clarifies this is a visual-review judgment.

## Final source context: remote host height and final-round guest guidance

### Remote host minimum height scales beyond the viewport

Root observation: at CSS viewport 1440x1000, host scoreboard with one guest/one score has document scrollHeight 1300, a large empty middle and actions below the fold; mobile host screens also put sparse controls below the fold.

Verified source cause: App applies `tvMode` to every remote host round, review and scoreboard, without viewport-size qualification (`src/App.svelte:43`). The underlying shell has `min-block-size:100dvh` (`src/App.svelte:134`), while `.shell.tv` applies CSS `zoom:1.3` to the whole shell with no compensating height rule (`src/App.svelte:140`). Thus the observed 1000-to-1300 height ratio exactly matches the 1.3 scale on the viewport-height minimum. The score rows container has `flex:1` (`src/screens/Scoreboard.svelte:241`) and absorbs the excess space above the winner/actions (`src/screens/Scoreboard.svelte:181`). This explains both the blank middle and displaced controls even with only one score: there is no need for long content. TV scaling applies on mobile too because there is no breakpoint in its condition or style. The comment calls the scale provisional and says real TV typography tokens are an open design question (`src/App.svelte:142`). This issue is separate from the local round's dense card heights above.

### Guest final-round Review claims another round is coming

Root observation: guest Round 1 of 1 review shows 'The next round starts on the big screen' in English and equivalent Arabic.

Verified direct cause: in the `phase === 'results' && results` branch (`src/screens/Join.svelte:455`), the footer always renders `join.results.next` with no final-round condition (`src/screens/Join.svelte:500`). English text is at `src/lib/i18n/en.ts:165`; Arabic equivalent is at `src/lib/i18n/ar.ts:188`. The result payload already includes zero-based roundIndex and roundCount; host uses roundCount 0 for endless (`src/screens/Review.svelte:220`, `src/screens/Review.svelte:222`). Therefore finite-final versus more-rounds distinction is available to the guest, but ignored by this footer. A later separate scores message changes the phase (`src/screens/Join.svelte:502`); it does not prevent this misleading interim final-review guidance. This is a shared conditional-rendering omission, not separate translation defects.
