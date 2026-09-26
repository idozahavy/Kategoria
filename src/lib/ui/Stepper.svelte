<script lang="ts">
  import type { Snippet } from 'svelte';

  import Button from './Button.svelte';

  /** − value + number picker; `children` renders extra controls after it (e.g. an ∞ chip). */
  let {
    value,
    ondecrement,
    onincrement,
    decrementLabel,
    incrementLabel,
    children,
  }: {
    value: string | number;
    ondecrement: () => void;
    onincrement: () => void;
    decrementLabel: string;
    incrementLabel: string;
    children?: Snippet;
  } = $props();
</script>

<!-- The signs are drawn, not typed: text − and + come from different fonts
     and sit at different sizes and heights. -->
<div class="stepper">
  <Button variant="secondary" ariaLabel={decrementLabel} onclick={ondecrement}>
    <svg class="sign" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
  </Button>
  <span class="stepper-value">{value}</span>
  <Button variant="secondary" ariaLabel={incrementLabel} onclick={onincrement}>
    <svg class="sign" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
  </Button>
  {@render children?.()}
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .sign {
    display: block;
    inline-size: var(--font-size-h2);
    block-size: var(--font-size-h2);
    fill: none;
    stroke: currentColor;
    stroke-width: 3.5;
    stroke-linecap: round;
  }
  .stepper-value {
    font-size: var(--font-size-h1);
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
    min-inline-size: 2ch;
    text-align: center;
  }
</style>
