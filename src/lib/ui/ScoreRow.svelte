<script lang="ts">
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { prefersReducedMotion, Tween } from 'svelte/motion';

  import Avatar from './Avatar.svelte';

  let {
    name,
    score,
    colorIndex,
    avatar = undefined,
    from = undefined,
    delta = undefined,
  }: {
    name: string;
    score: number;
    colorIndex: number;
    avatar?: string;
    /** Count up to `score` from here when the row appears (default: no count-up). */
    from?: number;
    /** Points gained this round, shown as a "+N" chip (hidden when absent or 0). */
    delta?: number;
  } = $props();

  /** How long the count-up runs. */
  const COUNT_UP_MS = 900;

  const shown = new Tween(
    untrack(() => from ?? score),
    { duration: () => (prefersReducedMotion.current ? 0 : COUNT_UP_MS), easing: cubicOut },
  );
  $effect(() => {
    shown.target = score;
  });
</script>

<div class="row">
  <Avatar {name} {avatar} {colorIndex} size={40} />
  <b class="name">{name}</b>
  {#if delta !== undefined && delta > 0}
    <span class="delta">+{delta}</span>
  {/if}
  <span class="score" aria-label={String(score)}>{Math.round(shown.current)}</span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .delta {
    margin-inline-start: auto;
    background: var(--color-success);
    color: var(--color-on-success);
    border-radius: var(--radius-pill);
    padding-inline: var(--space-2);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    animation: pop var(--duration-enter) var(--easing-spring) both;
  }
  .score {
    margin-inline-start: auto;
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-h2);
    min-inline-size: 3ch;
    text-align: end;
  }
  .delta + .score {
    margin-inline-start: 0;
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
