# QA Player 4 - Explorer (online room, French)

## Setup / path taken

- https://kategoria.pages.dev is BLOCKED by the browser pane's site permissions, so the run used the local dev server (http://localhost:5180, current HEAD 8ca489b) instead. PeerJS signalling still went through the public PeerJS cloud; `/turn-credentials` returns 404 in dev (Pages Function not served by Vite), so only STUN/host candidates were used - fine between tabs on one machine.
- Tabs: host tab-8 (1280x800, UI set to Francais), player tabs tab-9 / tab-10 (mobile 375x812).
- Host: Nouvelle partie -> "Les telephones rejoignent" -> room code SSYP shown with QR -> 2 phones joined -> Classique categories (Animal, Nourriture, Ville, Prenom, Objet), "Voter sur les telephones", 3 rounds, 2:00 timer.
- Player B (Bruno) joined via `?join=SSYP` on localhost. Player A (Amelie) had to join from http://127.0.0.1:5180 (separate origin) because two tabs on one origin share the device id (see Bug 2). The 127.0.0.1 origin had a saved Arabic UI, so Amelie played with an Arabic (RTL) phone UI against a French host - a nice mixed-language test.
- Played 2 full rounds (letters C and D), invented words "Crumblatouf" (voted out 👎) and "Dzorflux" (voted in 👍), reloaded Bruno's tab mid-round 2 and rejoined, then ended the game and checked final results on host and phone.
- Note: synthetic clicks by ref were unreliable on the mobile tab (layout shifted, clicks landed on "Scan the QR code" and typed text was lost), so most input was driven with DOM events via javascript_tool.

## Bugs

### 1. HIGH - Reloading a phone mid-round turns it into a second HOST of the game instead of rejoining

- Steps: host a phone room in tab A; in tab B (same origin, i.e. same device storage) join as Bruno; start round; type two answers; reload tab B.
- Expected: tab B goes back to the Join screen / straight into Bruno's seat (the `categories-guest` sessionStorage entry `{"code":"SSYP","name":"Bruno"}` is still there).
- Actual: App.svelte restores `localStorage['categories-active-game']` first and opens the HOST round screen ("Round 2 of 3 ... Waiting for... Bruno Amelie ... Finish round now") on the phone. The guest session is only read when the Join screen is opened manually; App.svelte never routes to Join on reload when a guest session exists.
- Real-world trigger: any phone that previously hosted an unfinished game (or a family tablet used both as host and player) will jump into the old hosted game when the player reloads/re-opens the tab mid-round. It can then drive the same game (Finish round now) from a second device. On a clean phone the player lands on Home and has to find "Join Game" again (fields prefilled), which kids will not figure out quickly.
- Also: the answers typed before the reload (Dauphin, Datte) were lost; after rejoining all 5 inputs were empty.

### 2. MED - Two tabs/players on the same browser share one device id; the second join silently kicks the first

- Steps: host in tab A; tab B joins as Amelie; tab C (same origin) joins as Bruno.
- Expected: two players, or a clear "this device is already in the room" message.
- Actual: host shows "1 connectes - Bruno"; Amelie's tab switches to "Connection lost - reconnecting..." forever (checked for 15+ s, never recovered, no button to give up / go home). `localStorage['categories-device-id']` is shared across tabs.
- Mostly a test-setup artifact, but the endless "reconnecting..." with no way out is a real UX dead end whenever the host rejects/replaces a seat.

### 3. MED - Opening the app in a fresh tab jumps straight into whatever game was last active on that origin

- Steps: open http://localhost:5180 in a new tab while another tab/tester has an active game.
- Actual: landed directly on another hotseat game's "Player 1 of 3 - [Hebrew name], it's your turn! Pass the device" screen, with a Hebrew letter but English UI. `categories-active-game` is per-origin, not per-tab, so two tabs fight over the same saved game.

### 4. LOW - Phone header stays "Join a game" for the whole game

- Round screen, vote screen, round results and final results on the phone all keep the title "Join a game" / "Rejoindre une partie" / Arabic equivalent above the content.

### 5. LOW - Speed-scoring deduction is unexplained on review

- Amelie's words showed "Unique! 9" and "Same word 4" while Bruno's identical-status words showed 10 / 5. Cause is speed scoring (game.ts scoreRound: -1 per finish rank). Nothing on the host or phone review says "-1: finished second", so it looks like a scoring bug to players.

### 6. LOW - "Dax" (French town) not in the Ville word list

- Went to a vote as a doubtful word. Accepted by vote so no harm, but a real sub-prefecture.

### 7. LOW - a11y: unlabeled controls

- Host "Qui joue ?" mode toggle buttons (Un ecran partage / Les telephones rejoignent) have no accessible name (read_page shows bare `button`).
- Join screen "Your name" textbox and the avatar button ("A"/"B" initial) have no label; round answer inputs on the phone have no placeholder or aria-label (category shown only as nearby text).

## Multiplayer / connection results

- Room open: "Ouverture d'une salle..." then code SSYP + QR within ~4 s. There is no visible join link to copy on the host (only QR + code); a copyable link would help desktop-to-desktop testing and remote play.
- Join by code: works. `?join=CODE` deep link: works, prefills the code.
- Host lobby list: shows initials + names and "N connectes". Updates live.
- Round start: phones switch to the round screen instantly, timer in sync (host 2:00 -> phones 1:57).
- Submit: phone shows "Sent! Look at the big screen". Host "En attente de..." list; I could not see any per-player done/connected indicator in the text (both names stay listed).
- Device voting: works well. Author's phone shows "That's your word! The others are voting on it."; voter phone gets Yes/No; host shows "0 sur 1 ont voter", "Mot 1 sur 2", and an override "Ou decidez ici". 👎 -> "Refuse au vote 0", 👍 -> accepted.
- Results on phones: full per-category breakdown with "You" marker, standings with deltas, "The next round starts on the big screen". Final: "Bruno wins!", Share results, Home.
- Reconnect: rejoin with the prefilled code/name got the same seat back and dropped straight into the running round (good), but see Bug 1 for how you get there and the lost answers. The host showed no "Bruno disconnected" state while Bruno was gone.
- Mixed languages: Arabic phone + French host works; categories stay in the game language (French) while the phone chrome is Arabic RTL. Vote prompt reads "hal 'Dax' fe'lan ville?" - French noun inside an Arabic sentence, acceptable.

## UX confusion

- Host auto-continue on the Scores screen ("Arreter la suite automatique (9)") starts a countdown without warning - fine but surprising.
- "Ville" category and the "En ville" quick pick both use the 🏙️ emoji.
- Fun fact ("Le savais-tu ?") is only on the host review, not on the phones - phone players looking at their own screen miss it.
- After reload the phone offers nothing that says "you were in room SSYP - rejoin?" (see Bug 1).

## Translation issues (French)

- Vote prompt: "« Crumblatouf », c'est vraiment objet ?" / "c'est vraiment ville ?" - missing article; should be "un objet" / "une ville". Same pattern in English phone: "Is "Crumblatouf" a real objet?" (French category noun in an English sentence; fine since game language is French, but the English template needs an article-free form anyway).
- "1 connectes" - should be singular "1 connecte" (plural rule not applied).
- Fun facts are in French (checked two: Chartres, Dromadaire) - good. No English fallback seen.
- Rest of the French UI read naturally.

## Console errors

- Host and phones: `Failed to load resource: 404` for `/turn-credentials` (dev server does not serve the Pages Function; expected locally, would matter only if the function is missing in prod). Bruno's tab logged it 4 times (once per join attempt).
- No JS exceptions or PeerJS errors observed.

## Fun score

7/10 - Phone play with device voting is genuinely fun and fast; watching an invented word get voted out on the other phone is the highlight. Loses points for the reload/rejoin path (landing on Home or, worse, on an old hosted game) and the silent "reconnecting..." dead end.
