<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    on = false,
    onclick,
    children,
  }: { on?: boolean; onclick?: () => void; children: Snippet } = $props();
</script>

<button type="button" class="chip" class:on aria-pressed={on} {onclick}>
  {@render children()}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border-radius: var(--radius-pill);
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-small);
    min-block-size: var(--size-touch-chip);
    padding-block: var(--space-2);
    padding-inline: var(--space-4);
    cursor: pointer;
    background: var(--color-surface);
    color: var(--color-muted);
    border: var(--border-width) solid var(--color-border-strong);
    transition: transform var(--duration-fast) var(--easing-spring);
  }
  .chip:active {
    transform: scale(0.95);
  }
  .chip.on {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-color: var(--color-primary);
  }
</style>
