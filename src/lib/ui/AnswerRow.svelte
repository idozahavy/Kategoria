<script lang="ts">
  import type { AnswerStatus } from '../types';

  /** One player's word in a results card: name, word, and a status/points badge. */
  let {
    name,
    word,
    status,
    points,
    label,
    isMe = false,
  }: {
    name: string;
    word: string;
    status: AnswerStatus;
    points: number;
    /** Badge text, already translated ("Unique!", "Shared", ...). */
    label: string;
    /** The viewer's own row (guest phones) — marked with a primary edge. */
    isMe?: boolean;
  } = $props();
</script>

<li class="answer-row" class:me={isMe}>
  <span class="player-name">{name}</span>
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
  .player-name {
    font-weight: var(--font-weight-subheading);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
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
