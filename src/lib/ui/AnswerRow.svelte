<script lang="ts">
  import type { AnswerStatus } from '../types';

  /** One player's word in a results card: name, word, and a status/points badge. */
  let {
    name,
    word,
    status,
    points,
    label,
    meLabel = undefined,
  }: {
    name: string;
    word: string;
    status: AnswerStatus;
    points: number;
    /** Badge text, already translated ("Unique!", "Shared", ...). */
    label: string;
    /** Set only on the viewer's own row (guest phones): the translated "You" pill. */
    meLabel?: string;
  } = $props();
</script>

<li class="answer-row" class:me={meLabel !== undefined}>
  <span class="who">
    <span class="player-name">{name}</span>
    {#if meLabel !== undefined}
      <span class="you">{meLabel}</span>
    {/if}
  </span>
  {#if word === ''}
    <span class="word-empty">—</span>
  {:else}
    <span class="word" class:invalid={status === 'invalid'}>{word}</span>
    <span
      class="badge"
      class:success={status === 'valid'}
      class:warning={status === 'shared'}
      class:muted={status === 'invalid'}
    >
      {label} · {points}
    </span>
  {/if}
</li>

<style>
  .answer-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .answer-row.me {
    border-inline-start: var(--border-edge-width) solid var(--color-primary);
    padding-inline-start: var(--space-2);
  }
  .me .player-name {
    color: var(--color-primary);
  }
  /* The name shrinks first, so the "You" pill always stays readable. */
  .who {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .player-name {
    font-weight: var(--font-weight-subheading);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .you {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-pill);
    padding-inline: var(--space-2);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-display);
    white-space: nowrap;
  }
  .word-empty {
    color: var(--color-muted);
  }
  .word.invalid {
    color: var(--color-muted);
    text-decoration: line-through;
  }
  .badge {
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .badge.success {
    background: var(--color-success);
    color: var(--color-on-success);
  }
  .badge.warning {
    background: var(--color-warning);
    color: var(--color-on-warning);
  }
  .badge.muted {
    background: var(--color-border);
    color: var(--color-muted);
  }
</style>
