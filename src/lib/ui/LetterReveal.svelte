<script lang="ts">
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  import LetterTile from './LetterTile.svelte';

  /**
   * Round start: the tile shuffles through the alphabet, lands on the round's
   * letter, then counts 3-2-1 before handing over. Full-screen, so nobody can
   * start early. Reduced motion skips the shuffle.
   */
  let {
    letters,
    letter,
    goLabel,
    onbeat,
    ondone,
  }: {
    /** The pool the shuffle shows. */
    letters: string[];
    letter: string;
    /** Shown after the countdown ("Go!"). */
    goLabel: string;
    /** Each beat, for sound/haptics: the shuffle landed, a count, go. */
    onbeat?: (beat: 'land' | 'count' | 'go') => void;
    ondone: () => void;
  } = $props();

  const SHUFFLE_STEP_MS = 70;
  const SHUFFLE_MS = 1100;
  const LAND_HOLD_MS = 700;
  const COUNT_STEP_MS = 650;
  const GO_HOLD_MS = 450;
  const COUNT_FROM = 3;

  let shown = $state('');
  let isLanded = $state(false);
  /** 3, 2, 1, then 0 = "Go!"; null before the countdown starts. */
  let count = $state<number | null>(null);

  onMount(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void): void => {
      timers.push(setTimeout(fn, ms));
    };
    let t = 0;
    if (prefersReducedMotion.current || letters.length < 2) {
      shown = letter;
    } else {
      shown = letters[0] ?? letter;
      let i = 0;
      const shuffle = setInterval(() => {
        i += 1;
        // Never land on the real letter early — it would spoil the reveal.
        const pool = letters.filter((l) => l !== letter);
        shown = pool[i % pool.length] ?? letter;
      }, SHUFFLE_STEP_MS);
      at(SHUFFLE_MS, () => clearInterval(shuffle));
      timers.push(shuffle);
      t = SHUFFLE_MS;
    }
    at(t, () => {
      shown = letter;
      isLanded = true;
      onbeat?.('land');
    });
    t += LAND_HOLD_MS;
    for (let n = COUNT_FROM; n >= 1; n--) {
      at(t, () => {
        count = n;
        onbeat?.('count');
      });
      t += COUNT_STEP_MS;
    }
    at(t, () => {
      count = 0;
      onbeat?.('go');
    });
    at(t + GO_HOLD_MS, ondone);
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  });
</script>

<div class="reveal" role="status" aria-live="assertive">
  <div class="tile-wrap" class:landed={isLanded}>
    {#key isLanded}
      <LetterTile letter={shown} size={160} />
    {/key}
  </div>
  <div class="count" aria-hidden={count === null}>
    {#if count !== null}
      {#key count}
        <span class="count-value" class:go={count === 0}>{count === 0 ? goLabel : count}</span>
      {/key}
    {/if}
  </div>
</div>

<style>
  .reveal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
  }
  /* While shuffling, the tile shows the pool without its landing pop. */
  .tile-wrap:not(.landed) :global(.tile) {
    animation: none;
    opacity: 0.85;
  }
  .count {
    /* Reserved height so the tile doesn't jump when the countdown appears. */
    min-block-size: calc(var(--font-size-display) * 2 * var(--line-height-display));
    display: flex;
    align-items: center;
  }
  .count-value {
    font-size: calc(var(--font-size-display) * 2);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
    font-variant-numeric: tabular-nums;
    color: var(--color-primary);
    animation: count-pop var(--duration-enter) var(--easing-spring) both;
  }
  .count-value.go {
    color: var(--color-accent);
  }
  @keyframes count-pop {
    0% {
      transform: scale(0.4);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .count-value {
      animation: fade var(--duration-fast) linear both;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
