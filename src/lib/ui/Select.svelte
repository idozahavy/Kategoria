<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Native <select> in the input style; `children` are the <option>s. */
  let {
    value = $bindable(),
    onchange,
    children,
  }: {
    value: string;
    onchange?: (value: string) => void;
    children: Snippet;
  } = $props();
</script>

<select class="native-select" bind:value onchange={(e) => onchange?.(e.currentTarget.value)}>
  {@render children()}
</select>

<style>
  .native-select {
    inline-size: 100%;
    min-block-size: var(--size-touch);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: var(--font-weight-body);
    font-family: inherit;
    padding-inline: var(--space-4);
  }
</style>
