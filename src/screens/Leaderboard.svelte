<script lang="ts">
  import { onMount } from 'svelte';

  import { listProfiles } from '../lib/db';
  import { t, tn } from '../lib/i18n';
  import { screen } from '../lib/stores';
  import type { PlayerProfile } from '../lib/types';
  import Avatar from '../lib/ui/Avatar.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';

  let profiles = $state<PlayerProfile[]>([]);
  let loaded = $state(false);

  onMount(async () => {
    try {
      profiles = (await listProfiles())
        .filter((p) => p.gamesPlayed > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints);
    } catch {
      profiles = []; // storage unavailable — show the empty state
    }
    loaded = true;
  });

  function statsLine(p: PlayerProfile): string {
    return `${$tn('board.games', p.gamesPlayed)} · ${$tn('board.wins', p.wins)}`;
  }
</script>

<div class="board">
  <TopBar
    title={$t('board.title')}
    onback={() => screen.set('home')}
    backLabel={$t('setup.back')}
  />

  {#if loaded && profiles.length === 0}
    <div class="empty">
      <div class="empty-emoji">🏆</div>
      <p class="empty-text">{$t('board.empty')}</p>
    </div>
  {:else}
    <div class="rows">
      {#each profiles as p, i (p.key)}
        <div class="row" class:top={i === 0}>
          <Avatar name={p.name} avatar={p.avatar} colorIndex={(i % 8) + 1} size={40} />
          {#if i === 0}<span class="crown">👑</span>{/if}
          <div class="who">
            <b class="name">{p.name}</b>
            <span class="stats">{statsLine(p)}</span>
          </div>
          <span class="points">{p.totalPoints}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .board {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    text-align: center;
  }
  .empty-emoji {
    font-size: calc(var(--font-size-display) * 1.6);
  }
  .empty-text {
    color: var(--color-muted);
    max-inline-size: 280px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
  }
  .row.top {
    border-color: var(--color-primary);
  }
  .crown {
    font-size: var(--font-size-body);
  }
  .who {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    flex: 1;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stats {
    color: var(--color-muted);
    font-size: var(--font-size-small);
  }
  .points {
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-h2);
  }
</style>
