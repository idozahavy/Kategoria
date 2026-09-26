<script lang="ts">
  /**
   * End-of-game celebration: a one-shot burst of player-colored pieces falling
   * across the whole screen. Decorative only; hidden under reduced motion.
   */
  let { count = 48 }: { count?: number } = $props();

  // Deterministic scatter (no Math.random): the same burst every time. Start
  // position, start time and fall speed use different co-prime strides, so
  // pieces never line up into rows that fall together.
  const pieces = $derived(
    Array.from({ length: count }, (_, i) => ({
      color: `var(--color-player-${String((i % 8) + 1)})`,
      start: `${String((i * 37) % 100)}%`,
      delay: `calc(var(--duration-fast) * ${String(((i * 53) % 17) / 2)})`,
      speed: 0.8 + ((i * 29) % 5) / 10,
      isLarge: i % 3 === 0,
      isRound: i % 2 === 0,
      drift: ((i * 11) % 5) - 2,
    })),
  );
</script>

<div class="confetti" aria-hidden="true">
  {#each pieces as p, i (i)}
    <span
      class="piece"
      class:large={p.isLarge}
      class:round={p.isRound}
      style:inset-inline-start={p.start}
      style:background={p.color}
      style:animation-delay={p.delay}
      style:--drift={p.drift}
      style:--speed={p.speed}
    ></span>
  {/each}
</div>

<style>
  .confetti {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: var(--z-toast);
  }
  .piece {
    position: absolute;
    inset-block-start: calc(-1 * var(--space-3));
    inline-size: var(--space-2);
    block-size: var(--space-3);
    border-radius: var(--radius-sm);
    opacity: 0;
    animation: fall calc(var(--duration-pulse) * 4 * var(--speed)) ease-in forwards;
  }
  .piece.large {
    inline-size: var(--space-3);
    block-size: var(--space-4);
  }
  .piece.round {
    border-radius: var(--radius-pill);
    block-size: var(--space-2);
  }
  .piece.large.round {
    block-size: var(--space-3);
  }
  @keyframes fall {
    0% {
      opacity: 1;
      transform: translate(0, 0) rotate(0deg);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(calc(var(--drift) * var(--space-6)), 110vh)
        rotate(calc((var(--drift) + 0.5) * 360deg));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti {
      display: none;
    }
  }
</style>
