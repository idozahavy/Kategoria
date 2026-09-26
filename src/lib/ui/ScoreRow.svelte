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
    meLabel = undefined,
    deltaLabel = undefined,
    scoreLabel = undefined,
  }: {
    name: string;
    score: number;
    colorIndex: number;
    avatar?: string;
    /** Count up to `score` from here when the row appears (default: no count-up). */
    from?: number;
    /** Points gained this round, shown as a "+N" chip (hidden when absent or 0). */
    delta?: number;
    /** Set only on the viewer's own row (guest phones): the translated "You" pill. */
    meLabel?: string;
    /** Screen-reader wording for the "+N" chip ("This round: +N"); translated. */
    deltaLabel?: string;
    /** Screen-reader wording for the total ("Total: N"); translated. */
    scoreLabel?: string;
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

<div class="row" class:me={meLabel !== undefined}>
  <Avatar {name} {avatar} {colorIndex} size={40} />
  <b class="name">{name}</b>
  {#if meLabel !== undefined}
    <span class="you">{meLabel}</span>
  {/if}
  {#if delta !== undefined && delta > 0}
    <span class="delta">
      <span aria-hidden={deltaLabel !== undefined}>+{delta}</span>
      {#if deltaLabel !== undefined}<span class="visually-hidden">{deltaLabel}</span>{/if}
    </span>
  {/if}
  <!-- The count-up is for the eyes; screen readers get the final number once,
       and again whenever it changes (a new round's standings). -->
  <span class="score" aria-hidden="true">{Math.round(shown.current)}</span>
  <span class="visually-hidden" aria-live="polite">{scoreLabel ?? score}</span>
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
  .row.me {
    outline: var(--border-width) solid var(--color-primary);
    outline-offset: calc(var(--border-width) * -1);
  }
  .name {
    min-inline-size: 0;
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
  @keyframes fade {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  /* Reduced motion: the chip fades in instead of scaling (scheme motion rule). */
  @media (prefers-reduced-motion: reduce) {
    .delta {
      animation-name: fade;
      animation-timing-function: linear;
    }
  }
</style>
