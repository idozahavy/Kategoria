<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="card">{@render children()}</div>

<style>
  .card {
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    /* Longhands so a parent can tighten the vertical padding alone (via the
       inherited --card-padding-block) on short screens. */
    padding-block: var(--card-padding-block, var(--space-4));
    padding-inline: var(--space-4);
  }
</style>
