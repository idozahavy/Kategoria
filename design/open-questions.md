# Open design questions

_Log undefined visual decisions here instead of improvising; the next `design-scheme revise` run turns them into real decisions._

- App name/logo: mockups use a placeholder "🎪 Categories!" title. A real name + wordmark treatment is undecided.
- Shared-screen (TV) type scale: provisionally implemented as `zoom: 1.3` + 560px shell on remote-host screens (App.svelte `.shell.tv`, design-ignore pragma). A real tokenized TV scale (per-size overrides instead of zoom) is still an open decision.
- Confetti/celebration visual spec (colors, particle count, duration) — motion tokens exist, the celebration composition itself is undefined.
- Remote waiting chips (host round screen): provisional pill chips flipping to success colors when a player has submitted (Round.svelte `.wait-chip`). Register as a component if kept.
- Emoji illustration sizes: hero/empty-state emoji use `calc(var(--font-size-display) * 1.6)` (≈64px) and the vote emoji `* 1.2` (≈48px); inline category/crown emoji use `--font-size-h2`. Dedicated illustration-size tokens are undecided.
- QR scanner viewfinder (join screen): provisional square `<video>` with `--radius-md` corners on a `--color-text` ground inside the standard Modal (Join.svelte `.viewfinder`). No scan-frame overlay or success flash defined yet.
- Device-vote tally chips (host review modal): provisional pill chips per player flipping to success/danger colors as ballots arrive (Review.svelte `.ballot`), same pattern as the remote waiting chips. Register as a component if kept.
- Guest round-results view (join screen): provisional reuse of the review answer rows/badges plus a standings card; the player's own row is marked with a primary inline-start edge (Join.svelte `.answer-row.me`). A dedicated "you" marker is undecided.
