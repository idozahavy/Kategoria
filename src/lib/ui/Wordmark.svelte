<script lang="ts">
  /**
   * The brand wordmark: every letter on its own little tile, like the round's
   * letter tile, cycling through the player colors with a playful tilt.
   * Decorative — the page heading carries the readable name.
   */
  let { text }: { text: string } = $props();

  /** Player colors 1–7 (8 is the neutral grey, too dull for the logo). */
  const COLOR_COUNT = 7;

  const letters = $derived([...text]);
</script>

<!-- dir="ltr": the brand spells left to right in every language. -->
<span class="wordmark" dir="ltr" aria-hidden="true">
  {#each letters as letter, i (i)}
    <span
      class="tile"
      class:tilt-a={i % 2 === 0}
      class:tilt-b={i % 2 === 1}
      style:--i={i}
      style:background="var(--color-player-{(i % COLOR_COUNT) + 1})">{letter}</span
    >
  {/each}
</span>

<style>
  .wordmark {
    display: inline-flex;
    gap: var(--space-1);
  }
  .tile {
    --tile-dim: var(--space-6);
    inline-size: var(--tile-dim);
    block-size: calc(var(--tile-dim) + var(--space-1));
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--color-surface);
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
    box-shadow: var(--shadow-card);
    animation: drop var(--duration-press) var(--easing-spring) both;
    /* Letters land one after another. */
    animation-delay: calc(var(--i) * var(--duration-fast) / 3);
  }
  .tilt-a {
    rotate: -4deg;
  }
  .tilt-b {
    rotate: 3deg;
  }
  /* Roomier phones and up get bigger tiles. */
  @media (min-width: 420px) {
    .tile {
      --tile-dim: calc(var(--space-6) + var(--space-2));
      font-size: var(--font-size-h1);
    }
  }
  @keyframes drop {
    0% {
      transform: translateY(-40%) scale(0.6);
      opacity: 0;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
  /* Reduced motion: a plain fade, no drop (scheme motion rule). */
  @keyframes fade {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      animation-name: fade;
      animation-timing-function: linear;
      animation-delay: 0s;
    }
  }
</style>
