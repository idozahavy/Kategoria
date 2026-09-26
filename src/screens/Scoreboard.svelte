<script lang="ts">
  import { recordGameResult, saveGame } from '../lib/db';
  import {
    createGame,
    currentResults,
    isFinished,
    roundPoints,
    startNextRound,
    statsChanges,
    totalScores,
    winnerIds,
  } from '../lib/game';
  import { t } from '../lib/i18n';
  import { getActiveRoom, setActiveRoom, type StandingRow, wireAvatar } from '../lib/p2p';
  import { resultsText, shareText } from '../lib/share';
  import { playFanfare, vibrate } from '../lib/sound';
  import { game, screen, setupTemplate, updateGame } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Confetti from '../lib/ui/Confetti.svelte';
  import ScoreRow from '../lib/ui/ScoreRow.svelte';
  import WinnerHero from '../lib/ui/WinnerHero.svelte';

  $effect(() => {
    if (!$game) screen.set('home');
  });

  // An unfinished game (endless, or peeking mid-way) gets a live-standings
  // view — the game only ends here when its rounds ran out or via the
  // explicit "end game" button.
  const isOver = $derived($game !== null && ($game.status === 'finished' || isFinished($game)));

  /** Ends the game for real: lifetime stats land and the fanfare plays. */
  function finalize(): void {
    const g = $game;
    if (!g || g.status === 'finished') return;
    // A revived game only moves the leaderboard by what the extra rounds changed.
    for (const change of statsChanges(g)) {
      const player = g.players.find((p) => p.id === change.playerId);
      if (player) void recordGameResult(player.name, change);
    }
    const results = currentResults(g);
    playFanfare();
    vibrate(200);
    updateGame((s) => {
      s.status = 'finished';
      if (s.hasRecordedStats !== true || s.recordedResults !== undefined) {
        s.recordedResults = results;
      }
    });
  }

  // A game that played all its rounds is over the moment it lands here.
  $effect(() => {
    if ($game && $game.status !== 'finished' && isFinished($game)) finalize();
  });

  let advancing = $state(false);

  // Remote game: the host device auto-advances after a short pause so the
  // table keeps moving without anyone tapping; one tap stops it for this round.
  const AUTO_NEXT_SECONDS = 10;
  let autoNextLeft = $state(AUTO_NEXT_SECONDS);
  let autoNextStopped = $state(false);
  const autoNextActive = $derived(
    $game !== null && !isOver && $game.settings.isRemote === true && !autoNextStopped,
  );

  $effect(() => {
    if (!autoNextActive) return;
    const id = setInterval(() => {
      autoNextLeft -= 1;
      if (autoNextLeft <= 0) {
        clearInterval(id);
        nextRound();
      }
    }, 1000);
    return () => clearInterval(id);
  });

  function stopAutoNext(): void {
    autoNextStopped = true;
  }

  const stopAutoText = $derived($t('score.stopAuto').replace('{n}', String(autoNextLeft)));

  function nextRound(): void {
    if (advancing) return;
    advancing = true;
    updateGame((g) => {
      startNextRound(g);
    });
    screen.set('round');
  }

  /** The scoreboard never traps a game: even an ended one can pick up again. */
  function oneMoreRound(): void {
    if (advancing) return;
    advancing = true;
    updateGame((g) => {
      g.status = 'playing';
      if (g.settings.isEndless !== true) g.settings.roundCount += 1;
      startNextRound(g);
    });
    screen.set('round');
  }

  /** Rounds already scored — the mid-game view says where the game stands. */
  const lastDoneRound = $derived($game?.rounds.findLast((r) => r.phase === 'done') ?? null);

  const standings = $derived.by(() => {
    if (!$game) return [];
    const totals = totalScores($game);
    const gained = lastDoneRound ? roundPoints($game, lastDoneRound) : new Map<string, number>();
    return $game.players
      .map((p) => ({ player: p, score: totals.get(p.id) ?? 0, delta: gained.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  });

  const afterRoundText = $derived(
    $t('score.afterRound')
      .replace('{n}', String((lastDoneRound?.index ?? -1) + 1))
      .replace(
        '{total}',
        $game?.settings.isEndless === true ? '∞' : String($game?.settings.roundCount ?? 0),
      ),
  );

  /** Best total holders; empty while nobody has scored (no crowns at 0–0). */
  const winners = $derived($game ? winnerIds($game) : []);
  const winnerPlayers = $derived(standings.filter((s) => winners.includes(s.player.id)));
  const winnerNames = $derived(winnerPlayers.map((s) => s.player.name));
  // A tie needs the plural verb ("ניצחו", "gagnent"), not the singular one.
  const winnerText = $derived(
    winnerNames.length === 0
      ? $t('score.noWinner')
      : $t(winnerNames.length > 1 ? 'score.winners' : 'score.winner').replace(
          '{name}',
          winnerNames.join(' & '),
        ),
  );

  // Remote game: guests see the final scores on their own devices too.
  let sentScores = false;
  $effect(() => {
    if (!isOver || $game?.settings.isRemote !== true || sentScores || standings.length === 0)
      return;
    sentScores = true;
    getActiveRoom()?.broadcast({
      type: 'scores',
      rows: standings.map((s): StandingRow => ({
        name: s.player.name,
        score: s.score,
        colorIndex: s.player.colorIndex,
        ...wireAvatar(s.player.avatar),
        delta: 0,
        isWinner: winners.includes(s.player.id),
      })),
      winner: winnerNames.join(' & '),
    });
  });

  function playAgain() {
    if (!$game) return;
    const fresh = createGame($game.settings, $game.players);
    startNextRound(fresh);
    game.set(fresh);
    void saveGame(fresh);
    screen.set('round');
  }

  /** Final standings as a chat message (share sheet on phones, clipboard elsewhere). */
  let shareNote = $state('');
  async function shareResults(): Promise<void> {
    const text = resultsText(
      $t('share.heading'),
      standings.map((s) => ({
        name: s.player.name,
        score: s.score,
        isWinner: winners.includes(s.player.id),
      })),
      `${location.origin}${location.pathname}`,
    );
    const outcome = await shareText(text);
    if (outcome === 'copied') shareNote = $t('share.copied');
    else if (outcome === 'failed') shareNote = $t('share.failed');
    else shareNote = '';
  }

  /** Back to the setup wizard with this game's players and settings filled in. */
  function changeSetup(): void {
    if (!$game) return;
    setupTemplate.set(structuredClone({ settings: $game.settings, players: $game.players }));
    screen.set('new-game');
  }

  function goHome() {
    updateGame((g) => {
      g.status = 'finished';
    });
    if ($game?.settings.isRemote === true) setActiveRoom(null);
    screen.set('home');
  }
</script>

{#if $game}
  {#if isOver && winnerPlayers.length > 0}
    <Confetti />
  {/if}

  {#if isOver}
    <!-- The winner is the hero of the final screen; the full table follows. -->
    <WinnerHero
      winners={winnerPlayers.map((w) => ({
        name: w.player.name,
        avatar: w.player.avatar,
        colorIndex: w.player.colorIndex,
      }))}
      text={winnerText}
    />
  {:else}
    <div class="heading">
      <h1 class="title">{$t('score.title')}</h1>
      {#if lastDoneRound !== null}
        <p class="subtitle">{afterRoundText}</p>
      {/if}
    </div>
  {/if}

  <div class="rows">
    <Card>
      <div class="row-list">
        {#each standings as s (s.player.id)}
          {@const isWinner = winners.includes(s.player.id)}
          <div class="row-wrap">
            <!-- Every row keeps the crown's slot, so names line up under the winner's. -->
            {#if winners.length > 0}<span class="crown" aria-hidden="true"
                >{isWinner ? '👑' : ''}</span
              >{/if}
            <!-- Mid-game rows count up from before the last round and show its gain. -->
            <ScoreRow
              name={s.player.name}
              score={s.score}
              from={isOver ? 0 : s.score - s.delta}
              delta={isOver ? undefined : s.delta}
              colorIndex={s.player.colorIndex}
              avatar={s.player.avatar}
            />
          </div>
        {/each}
      </div>
    </Card>
  </div>

  {#if isOver}
    <div class="actions">
      <Button variant="secondary" block disabled={advancing} onclick={oneMoreRound}
        >{$t('score.oneMore')}</Button
      >
      <Button variant="accent" block onclick={playAgain}>{$t('score.playAgain')}</Button>
      <div class="pair">
        <Button variant="ghost" block onclick={() => void shareResults()}
          >📤 {$t('share.action')}</Button
        >
        <!-- A phones-join room can't be re-set up here: guests would have to rejoin. -->
        {#if $game.settings.isRemote !== true}
          <Button variant="ghost" block onclick={changeSetup}>⚙️ {$t('score.changeSetup')}</Button>
        {/if}
      </div>
      <p class="share-note" aria-live="polite">{shareNote}</p>
      <Button variant="ghost" block onclick={goHome}>{$t('score.home')}</Button>
    </div>
  {:else}
    <div class="actions">
      <Button variant="primary" block disabled={advancing} onclick={nextRound}
        >{$t('review.next')}</Button
      >
      {#if autoNextActive}
        <Button variant="ghost" block onclick={stopAutoNext}>{stopAutoText}</Button>
      {/if}
      <!-- Quiet on purpose: ending early shouldn't compete with playing on. -->
      <Button variant="ghost" block onclick={finalize}>{$t('score.endGame')}</Button>
    </div>
  {/if}
{/if}

<style>
  .heading {
    text-align: center;
  }
  .title {
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
  }
  .subtitle {
    color: var(--color-muted);
    font-weight: var(--font-weight-subheading);
    font-variant-numeric: tabular-nums;
  }
  /* Takes the free height, so the actions stay at the bottom of the screen. */
  .rows {
    flex: 1;
  }
  .row-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .row-wrap :global(.row) {
    flex: 1;
  }
  .crown {
    font-size: var(--font-size-h2);
    flex-shrink: 0;
    min-inline-size: calc(var(--font-size-h2) * 1.3);
    text-align: center;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* Side by side when both labels fit on one line each; stacked otherwise
     (long languages) — never a label broken over two lines. */
  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pair > :global(.btn) {
    flex: 1 1 auto;
    white-space: nowrap;
    padding-inline: var(--space-3);
  }
  .share-note {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    text-align: center;
  }
  .share-note:empty {
    display: none;
  }
</style>
