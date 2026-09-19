<script lang="ts">
  import { recordGameResult, saveGame } from '../lib/db';
  import { createGame, isFinished, startNextRound, totalScores } from '../lib/game';
  import { t } from '../lib/i18n';
  import { getActiveRoom, setActiveRoom } from '../lib/p2p';
  import { playFanfare, vibrate } from '../lib/sound';
  import { game, screen, updateGame } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import ScoreRow from '../lib/ui/ScoreRow.svelte';

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
    if (g.hasRecordedStats !== true) {
      const totals = totalScores(g);
      const top = Math.max(0, ...totals.values());
      for (const p of g.players) {
        if (p.isBot === true) continue;
        void recordGameResult(p.name, totals.get(p.id) ?? 0, (totals.get(p.id) ?? 0) === top);
      }
    }
    playFanfare();
    vibrate(200);
    updateGame((s) => {
      s.status = 'finished';
      s.hasRecordedStats = true;
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

  const standings = $derived.by(() => {
    if (!$game) return [];
    const totals = totalScores($game);
    return $game.players
      .map((p) => ({ player: p, score: totals.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  });

  const topScore = $derived(standings[0]?.score ?? 0);
  const winnerNames = $derived(
    standings.filter((s) => s.score === topScore).map((s) => s.player.name),
  );
  // A tie needs the plural verb ("ניצחו", "gagnent"), not the singular one.
  const winnerText = $derived(
    $t(winnerNames.length > 1 ? 'score.winners' : 'score.winner').replace(
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
      rows: standings.map((s) => ({ name: s.player.name, score: s.score })),
      winner: winnerNames.join(' & '),
    });
  });

  const confettiDots = Array.from({ length: 24 }, (_, i) => i);
  function dotColor(i: number) {
    return `var(--color-player-${(i % 8) + 1})`;
  }
  function dotLeft(i: number) {
    return `${(i * 37) % 100}%`;
  }
  function dotDelay(i: number) {
    return `${(i % 6) * 0.08}s`;
  }

  function playAgain() {
    if (!$game) return;
    const fresh = createGame($game.settings, $game.players);
    startNextRound(fresh);
    game.set(fresh);
    void saveGame(fresh);
    screen.set('round');
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
  {#if isOver}
    <div class="confetti" aria-hidden="true">
      {#each confettiDots as i (i)}
        <span
          class="dot"
          style="inset-inline-start:{dotLeft(i)}; background:{dotColor(
            i,
          )}; animation-delay:{dotDelay(i)};"
        ></span>
      {/each}
    </div>
  {/if}

  <h1 class="title">{$t('score.title')}</h1>

  <div class="rows">
    {#each standings as s (s.player.id)}
      <div class="row-wrap" class:top={s.score === topScore}>
        {#if s.score === topScore}<span class="crown">👑</span>{/if}
        <ScoreRow
          name={s.player.name}
          score={s.score}
          colorIndex={s.player.colorIndex}
          avatar={s.player.avatar}
        />
      </div>
    {/each}
  </div>

  {#if isOver}
    <p class="winner">{winnerText}</p>

    <div class="actions">
      <Button variant="secondary" block disabled={advancing} onclick={oneMoreRound}
        >{$t('score.oneMore')}</Button
      >
      <Button variant="accent" block onclick={playAgain}>{$t('score.playAgain')}</Button>
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
      <Button variant="danger" block onclick={finalize}>{$t('score.endGame')}</Button>
    </div>
  {/if}
{/if}

<style>
  .confetti {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: var(--z-toast);
  }
  .dot {
    position: absolute;
    inset-block-start: -8px;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--radius-pill);
    animation: fall 1.5s ease-in forwards;
  }
  @keyframes fall {
    to {
      transform: translateY(110vh) rotate(180deg);
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti {
      display: none;
    }
  }
  .title {
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
    text-align: center;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
  }
  .row-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .row-wrap.top {
    transform: scale(1.05);
  }
  .row-wrap :global(.row) {
    flex: 1;
  }
  .crown {
    font-size: var(--font-size-h2);
    flex-shrink: 0;
  }
  .winner {
    text-align: center;
    font-size: var(--font-size-h1);
    font-weight: var(--font-weight-heading);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
