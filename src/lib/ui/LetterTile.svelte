<script lang="ts">
  let { letter, size = 96 }: { letter: string; size?: number } = $props();
</script>

<div class="tile" style="--tile-size-default:{size}px;">
  {letter}
</div>

<style>
  .tile {
    /* The `size` prop is the default; a parent can shrink the tile by setting
       --tile-size (e.g. short phone screens) without touching the prop. */
    --tile-dim: var(--tile-size, var(--tile-size-default));
    inline-size: var(--tile-dim);
    block-size: var(--tile-dim);
    font-size: calc(var(--tile-dim) * 0.58);
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--font-weight-display);
    box-shadow: var(--shadow-card);
    animation: pop var(--duration-enter) var(--easing-spring) both;
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    70% {
      transform: scale(1.08);
      opacity: 1;
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      animation: none;
    }
  }
</style>
