# Open design questions

_Log undefined visual decisions here instead of improvising; the next `design-scheme revise` run turns them into real decisions._

- App name/logo: mockups use a placeholder "🎪 Categories!" title. A real name + wordmark treatment is undecided.
- Shared-screen (TV) type scale: provisionally implemented as a `--tv-scale` custom property on the shell (1 by default, 1.3 on remote-host screens driving `zoom`, forced back to 1 under 600px so a phone hosting a room isn't zoomed); `min-block-size` divides it back out so the zoomed shell isn't taller than the viewport (App.svelte `.shell` / `.shell.tv`, design-ignore pragma). A real tokenized TV scale (per-size overrides instead of zoom) is still an open decision.
- Confetti/celebration visual spec — provisional in `src/lib/ui/Confetti.svelte` (48 player-colored pieces, two sizes, round + rounded-rect, ≈2.4 s fall built from `--duration-pulse`, hidden under reduced motion) and `WinnerHero.svelte` (crowned 112px avatars, accent ring, display-size accent headline). Tokenize if kept.
- Remote waiting chips (host round screen): provisional pill chips flipping to success colors when a player has submitted (Round.svelte `.wait-chip`). Register as a component if kept.
- Emoji illustration sizes: hero/empty-state emoji use `calc(var(--font-size-display) * 1.6)` (≈64px) and the vote emoji `* 1.2` (≈48px); inline category/crown emoji use `--font-size-h2`. Dedicated illustration-size tokens are undecided.
- QR scanner viewfinder (join screen): provisional square `<video>` with `--radius-md` corners on a `--color-text` ground inside the standard Modal (Join.svelte `.viewfinder`). No scan-frame overlay or success flash defined yet.
- Device-vote tally chips (host review modal): provisional pill chips per player flipping to success/danger colors as ballots arrive (Review.svelte `.ballot`), same pattern as the remote waiting chips. Register as a component if kept.
- Guest round-results view (join screen): provisional reuse of the review answer rows/badges plus a standings card; the player's own row is marked with a primary inline-start edge (Join.svelte `.answer-row.me`). A dedicated "you" marker is undecided.
- Letter reveal (round start): provisional `src/lib/ui/LetterReveal.svelte` — full-screen 160px tile shuffling ~1.1 s, landing pop, 3-2-1-Go at 2× display size in primary/accent; reduced motion skips the shuffle.
- Timer stages: provisional `TimerPill` calm (primary) → hurry (warning, last third, min 20 s) → final (danger + pulse, last 10 s), with a draining strip along the bottom; `large` variant (display size) on the shared screen.
- TV lobby: room code at 2.2× display and a 320px QR above 600px viewport width (NewGame.svelte media query) — part of the open TV-scale decision above.
- Pass-the-device panel (pass-&-play turn start): provisional "Player n of m" pill, 112px avatar ringed in the player's color with a 🙈 badge, muted "no peeking" hint, "I'm ready!" button (Round.svelte `.handoff-*`). Register as a component if kept.
- Mid-game scoreboard: standings inside a Card with a muted "After round n of m" subtitle and per-round "+N" chips; "End the game" demoted to a ghost button (Scoreboard.svelte).
